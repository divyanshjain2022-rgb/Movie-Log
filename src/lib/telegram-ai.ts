// Conversational layer for the Telegram bot: Gemini with function calling
// over the app's own data (log, gift cards, live PVR picks, stats), plus
// natural-language actions (rate a movie, add to watchlist). Short rolling
// history lives in bot_state so follow-ups work.

import { GoogleGenAI, ThinkingLevel, Type, type FunctionDeclaration } from "@google/genai";
import {
  getBotState,
  istDateString,
  resolveBotUserId,
  serviceClient,
  setBotState,
  SITE_URL,
} from "@/lib/telegram";
import { calculateValueScore, DEFAULT_FORMULA_PARAMS, getValueTier } from "@/lib/formula";
import type { FormulaParams } from "@/types";

// Free-tier Gemini quotas are per-model per-day (3.5-flash allows only 20
// requests/day), so exhausting one model falls through to the next.
const MODELS = ["gemini-3.5-flash", "gemini-3-flash-preview", "gemini-2.5-flash", "gemini-3.1-flash-lite"];
const HISTORY_KEY = "chat_history";
const MAX_HISTORY_TURNS = 16;

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function activeParams(): Promise<FormulaParams> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return DEFAULT_FORMULA_PARAMS;
  // Service role sees every user's configs — scope to the app's account or
  // maybeSingle() trips over a stray second row and silently falls back.
  const { data } = await supabase
    .from("formula_configs")
    .select("params")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  return ((data as { params?: FormulaParams } | null)?.params as FormulaParams) || DEFAULT_FORMULA_PARAMS;
}

// The chat message currently being processed — recorded as audit context.
let currentUserMessage = "";

async function logBotEdit(
  tableName: string,
  recordId: string,
  changes: Record<string, { old: unknown; new: unknown }>
): Promise<void> {
  const supabase = serviceClient();
  if (!supabase || Object.keys(changes).length === 0) return;
  await supabase.from("bot_edits").insert({
    table_name: tableName,
    record_id: recordId,
    changes,
    context: currentUserMessage.slice(0, 500) || null,
  } as never);
}

// Whitelisted, audited movie editor. Recomputes value_score when a field it
// depends on changes. Never deletes anything.
const EDITABLE_MOVIE_FIELDS = [
  "rating", "review", "remarks", "fnb_cost", "fnb_items", "other_expenses",
  "ticket_cost", "convenience_fee", "seat", "audi", "showtime", "date",
] as const;
const SCORE_FIELDS = new Set([
  "rating", "fnb_cost", "other_expenses", "ticket_cost", "convenience_fee",
]);

export async function updateMovieFields(
  movieId: string,
  updates: Record<string, unknown>
): Promise<{ title: string; changes: Record<string, { old: unknown; new: unknown }>; valueScore: number | null } | { error: string }> {
  const supabase = serviceClient();
  if (!supabase) return { error: "no database access" };

  const filtered: Record<string, unknown> = {};
  for (const field of EDITABLE_MOVIE_FIELDS) {
    if (updates[field] !== undefined && updates[field] !== null) filtered[field] = updates[field];
  }
  if (Object.keys(filtered).length === 0) return { error: "no editable fields provided" };
  if (typeof filtered.rating === "number" && (filtered.rating < 1 || filtered.rating > 10)) {
    return { error: "rating must be between 1 and 10" };
  }

  const { data: before } = await supabase
    .from("movies")
    .select("title,rating,review,remarks,fnb_cost,fnb_items,other_expenses,ticket_cost,convenience_fee,seat,audi,showtime,date,value_score")
    .eq("id", movieId)
    .maybeSingle();
  if (!before) return { error: "movie not found" };
  const beforeRow = before as Record<string, unknown> & { title: string; value_score: number | null };

  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const [field, value] of Object.entries(filtered)) {
    if (beforeRow[field] !== value) changes[field] = { old: beforeRow[field] ?? null, new: value };
  }
  if (Object.keys(changes).length === 0) {
    return { title: beforeRow.title, changes, valueScore: beforeRow.value_score };
  }

  const { error } = await supabase.from("movies").update(filtered as never).eq("id", movieId);
  if (error) return { error: error.message };

  // Recompute the value score when its inputs moved.
  let valueScore: number | null = beforeRow.value_score;
  const touchesScore = Object.keys(changes).some((field) => SCORE_FIELDS.has(field));
  const effectiveRating = (filtered.rating ?? beforeRow.rating) as number | null;
  if (touchesScore && effectiveRating && effectiveRating > 0) {
    const rated = await applyRatingInternal(movieId, effectiveRating);
    if (rated) {
      valueScore = rated.valueScore;
      if (beforeRow.value_score !== valueScore) {
        changes.value_score = { old: beforeRow.value_score, new: valueScore };
      }
    }
  }

  await logBotEdit("movies", movieId, changes);
  return { title: beforeRow.title, changes, valueScore };
}

async function findMovieByTitle(title: string): Promise<{ id: string; title: string } | null> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId || !title) return null;
  const { data } = await supabase
    .from("movies")
    .select("id,title,date")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(80);
  const wanted = norm(title);
  return (
    ((data || []) as Array<{ id: string; title: string }>).find(
      (m) => norm(m.title) === wanted || norm(m.title).includes(wanted) || wanted.includes(norm(m.title))
    ) || null
  );
}

// Shared by the inline rating buttons and the conversational rate_movie tool.
async function applyRatingInternal(
  movieId: string,
  rating: number
): Promise<{ title: string; valueScore: number | null; tierLabel: string | null } | null> {
  const supabase = serviceClient();
  if (!supabase) return null;
  const { data: movie } = await supabase
    .from("movies")
    .select(
      "title,ticket_cost,convenience_fee,fnb_cost,other_expenses,passport_savings,format:formats(weight),movie_gift_cards(amount_used,purpose,gift_card:gift_cards(discount_percent))"
    )
    .eq("id", movieId)
    .maybeSingle();
  if (!movie) return null;
  const m = movie as unknown as {
    title: string;
    ticket_cost: number;
    convenience_fee: number;
    fnb_cost: number | null;
    other_expenses: number | null;
    passport_savings: number | null;
    format: { weight: number | null } | null;
    movie_gift_cards: Array<{
      amount_used: number;
      purpose: string | null;
      gift_card: { discount_percent: number | null } | null;
    }> | null;
  };

  const params = await activeParams();
  let cost = (m.ticket_cost || 0) + (m.convenience_fee || 0) - (m.passport_savings || 0);
  if (params.use_true_cost) cost += (m.fnb_cost || 0) + (m.other_expenses || 0);
  cost -= (m.movie_gift_cards || [])
    .filter((g) => params.use_true_cost || (g.purpose || "ticket") === "ticket")
    .reduce((sum, g) => sum + g.amount_used * ((g.gift_card?.discount_percent || 0) / 100), 0);
  const valueScore = cost > 0 ? calculateValueScore(rating, cost, m.format?.weight || 1, params) : null;

  await supabase.from("movies").update({ rating, value_score: valueScore } as never).eq("id", movieId);
  return {
    title: m.title,
    valueScore,
    tierLabel: valueScore ? getValueTier(valueScore, params).label : null,
  };
}

// Public entry (rating buttons): audited like every other bot write.
export async function applyRating(
  movieId: string,
  rating: number
): Promise<{ title: string; valueScore: number | null; tierLabel: string | null } | null> {
  const supabase = serviceClient();
  if (!supabase) return null;
  const { data: before } = await supabase
    .from("movies")
    .select("rating,value_score")
    .eq("id", movieId)
    .maybeSingle();
  const result = await applyRatingInternal(movieId, rating);
  if (result && before) {
    const b = before as { rating: number | null; value_score: number | null };
    await logBotEdit("movies", movieId, {
      rating: { old: b.rating, new: rating },
      value_score: { old: b.value_score, new: result.valueScore },
    });
  }
  return result;
}

// ---- Tools the model can call ----

async function toolRecommendations(args: { query?: string }): Promise<unknown> {
  const secret = process.env.CRON_SECRET;
  const params = new URLSearchParams({ city: "Lucknow" });
  if (args.query) params.set("text", args.query);
  const response = await fetch(`${SITE_URL}/api/pvr/recommendations?${params}`, {
    headers: secret ? { "x-bot-secret": secret } : undefined,
  });
  if (!response.ok) return { error: `recommendations unavailable (${response.status})` };
  const payload = (await response.json()) as {
    recommendations: Array<{
      movie: { title: string; genres: string[]; languages: string[] };
      predictedRating: number;
      reasons: string[];
      options: Array<{
        show: { showTime: string; cinemaName: string; format: string; redirectUrl: string };
        displayPrice: number | null;
        valueScore: number;
        occupancyPercent: number | null;
      }>;
    }>;
    upcoming: Array<{ title: string; releaseDate: string | null; onWatchlist?: boolean }>;
  };
  return {
    nowShowing: (payload.recommendations || []).slice(0, 8).map((rec) => ({
      title: rec.movie.title,
      genres: rec.movie.genres,
      languages: rec.movie.languages,
      predictedRatingForUser: rec.predictedRating,
      whyRecommended: rec.reasons,
      shows: rec.options.slice(0, 3).map((option) => ({
        time: option.show.showTime,
        cinema: option.show.cinemaName,
        format: option.show.format,
        price: option.displayPrice,
        valueScore: option.valueScore,
        hallFullPercent: option.occupancyPercent,
        bookUrl: option.show.redirectUrl,
      })),
    })),
    upcoming: (payload.upcoming || []).slice(0, 10),
  };
}

async function toolGiftCards(): Promise<unknown> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return { error: "no database access" };
  const { data } = await supabase
    .from("gift_cards")
    .select(
      "face_value,amount_paid,discount_percent,expiry_date,platform:platforms(name),movie_gift_cards(amount_used)"
    )
    .eq("user_id", userId)
    .order("expiry_date", { ascending: true });
  return ((data || []) as unknown as Array<{
    face_value: number;
    discount_percent: number | null;
    expiry_date: string;
    platform: { name: string } | null;
    movie_gift_cards: Array<{ amount_used: number }> | null;
  }>)
    .map((card) => ({
      platform: card.platform?.name || "GC",
      remaining: Math.max(
        card.face_value - (card.movie_gift_cards || []).reduce((s, u) => s + u.amount_used, 0),
        0
      ),
      discountPercent: Math.round(card.discount_percent || 0),
      expiryDate: card.expiry_date,
    }))
    .filter((card) => card.remaining > 0.5);
}

async function toolRecentMovies(args: {
  limit?: number;
  since?: string;
  until?: string;
}): Promise<unknown> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return { error: "no database access" };
  let query = supabase
    .from("movies")
    .select("title,date,rating,value_score,total_cost,showtime,occupancy,theater:theaters(name),format:formats(name)")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(Math.min(args.limit || 25, 100));
  if (args.since) query = query.gte("date", args.since);
  if (args.until) query = query.lte("date", args.until);
  const { data, error } = await query;
  if (error) return { error: error.message };
  // Give the model the log's boundaries so "before the log started" questions
  // can't be answered with invented movies.
  const { data: first } = await supabase
    .from("movies")
    .select("date")
    .eq("user_id", userId)
    .order("date", { ascending: true })
    .limit(1)
    .maybeSingle();
  return {
    logStartsOn: (first as { date?: string } | null)?.date || null,
    movies: data || [],
    note: "Empty movies array means NOTHING was watched in the requested window.",
  };
}

async function toolStats(args: { year?: number }): Promise<unknown> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return { error: "no database access" };
  const { data } = await supabase
    .from("movies")
    .select("date,rating,total_cost,fnb_cost,genres,movie_gift_cards(amount_used,gift_card:gift_cards(discount_percent))")
    .eq("user_id", userId);
  let rows = (data || []) as unknown as Array<{
    date: string;
    rating: number | null;
    total_cost: number;
    fnb_cost: number | null;
    genres: string[] | null;
    movie_gift_cards: Array<{ amount_used: number; gift_card: { discount_percent: number | null } | null }> | null;
  }>;
  if (args.year) rows = rows.filter((m) => new Date(m.date).getFullYear() === args.year);
  const rated = rows.filter((m) => (m.rating || 0) > 0);
  const genreCounts: Record<string, number> = {};
  rows.forEach((m) => (m.genres || []).forEach((g) => (genreCounts[g] = (genreCounts[g] || 0) + 1)));
  return {
    movies: rows.length,
    totalSpend: Math.round(rows.reduce((s, m) => s + m.total_cost, 0)),
    fnbSpend: Math.round(rows.reduce((s, m) => s + (m.fnb_cost || 0), 0)),
    gcSaved: Math.round(
      rows.reduce(
        (s, m) =>
          s +
          (m.movie_gift_cards || []).reduce(
            (x, g) => x + g.amount_used * ((g.gift_card?.discount_percent || 0) / 100),
            0
          ),
        0
      )
    ),
    avgRating: rated.length ? +(rated.reduce((s, m) => s + (m.rating || 0), 0) / rated.length).toFixed(1) : null,
    topGenres: Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}

async function toolLogMovie(args: {
  title?: string;
  date?: string;
  showtime?: string;
  theater?: string;
  format?: string;
  ticket_cost?: number;
  convenience_fee?: number;
  fnb_cost?: number;
  fnb_items?: string;
  other_expenses?: number;
  seat?: string;
  audi?: string;
  rating?: number;
  review?: string;
  gc_amount_used?: number;
  gc_purpose?: string;
  gc_face_value?: number;
}): Promise<unknown> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return { error: "no database access" };
  if (!args.title) return { error: "need at least a title" };

  const existing = await findMovieByTitle(args.title);
  if (existing && norm(existing.title) === norm(args.title)) {
    return { error: `"${existing.title}" is already logged — use update_movie to change it` };
  }

  // Match theater + format against the user's tables.
  const [{ data: theaters }, { data: formats }] = await Promise.all([
    supabase.from("theaters").select("id,name").eq("user_id", userId),
    supabase.from("formats").select("id,name").eq("user_id", userId),
  ]);
  const theaterTokens = (value: string) => norm(value).split(" ").filter(Boolean);
  const theater = args.theater
    ? ((theaters || []) as Array<{ id: string; name: string }>)
        .map((t) => {
          const wanted = theaterTokens(args.theater!);
          const have = new Set(theaterTokens(t.name));
          return { t, score: wanted.filter((x) => have.has(x)).length / Math.max(wanted.length, 1) };
        })
        .sort((a, b) => b.score - a.score)
        .find((x) => x.score >= 0.4)?.t || null
    : null;
  const wantedFormat = norm(args.format || "2d");
  const format = ((formats || []) as Array<{ id: string; name: string }>)
    .map((f) => {
      const tokens = norm(f.name).split(" ").filter(Boolean);
      return { f, score: tokens.every((t) => wantedFormat.includes(t)) ? tokens.length : 0 };
    })
    .sort((a, b) => b.score - a.score)
    .find((x) => x.score > 0)?.f || null;

  // TMDB enrichment, same as ticket-photo logging.
  let tmdbFields: Record<string, unknown> = {};
  try {
    const searchResponse = await fetch(`${SITE_URL}/api/tmdb?query=${encodeURIComponent(args.title)}`);
    const search = (await searchResponse.json()) as { results?: Array<{ tmdb_id: number }> };
    if (search.results?.[0]?.tmdb_id) {
      const detailResponse = await fetch(`${SITE_URL}/api/tmdb?id=${search.results[0].tmdb_id}`);
      if (detailResponse.ok) {
        const d = (await detailResponse.json()) as Record<string, unknown>;
        tmdbFields = {
          tmdb_id: d.tmdb_id ?? null,
          runtime_minutes: d.runtime_minutes ?? null,
          genres: Array.isArray(d.genres) && d.genres.length > 0 ? d.genres : null,
          language: d.language ?? null,
          director: d.director ?? null,
          poster_url: d.poster_url ?? null,
          release_date: d.release_date ?? null,
          overview: d.overview ?? null,
          cast_members: Array.isArray(d.cast_members) && d.cast_members.length > 0 ? d.cast_members : null,
          composer: d.composer ?? null,
          cinematographer: d.cinematographer ?? null,
          budget: d.budget ?? null,
          box_office: d.box_office ?? null,
          tmdb_rating: d.tmdb_rating ?? null,
          tmdb_vote_count: d.tmdb_vote_count ?? null,
          certification: d.certification ?? null,
          trailer_url: d.trailer_url ?? null,
          keywords: Array.isArray(d.keywords) && d.keywords.length > 0 ? d.keywords : null,
        };
      }
    }
  } catch {
    // best-effort
  }

  const row = {
    user_id: userId,
    title: args.title,
    date: args.date || istDateString(),
    showtime: args.showtime || null,
    theater_id: theater?.id || null,
    format_id: format?.id || null,
    seat: args.seat || null,
    audi: args.audi || null,
    ticket_cost: args.ticket_cost || 0,
    convenience_fee: args.convenience_fee || 0,
    fnb_cost: args.fnb_cost || null,
    fnb_items: args.fnb_items || null,
    other_expenses: args.other_expenses || null,
    review: args.review || null,
    status: "watched",
    ...tmdbFields,
  };
  const { data: created, error } = await supabase
    .from("movies")
    .insert(row as never)
    .select("id")
    .single();
  if (error || !created) return { error: error?.message || "insert failed" };
  const movieId = (created as { id: string }).id;

  // Optional gift-card usage: match a card with enough remaining balance.
  let gcNote: string | null = null;
  if (args.gc_amount_used && args.gc_amount_used > 0) {
    const { data: cards } = await supabase
      .from("gift_cards")
      .select("id,face_value,platform:platforms(name),movie_gift_cards(amount_used)")
      .eq("user_id", userId);
    const usable = ((cards || []) as unknown as Array<{
      id: string;
      face_value: number;
      platform: { name: string } | null;
      movie_gift_cards: Array<{ amount_used: number }> | null;
    }>)
      .map((c) => ({
        ...c,
        remaining: Math.max(c.face_value - (c.movie_gift_cards || []).reduce((x, u) => x + u.amount_used, 0), 0),
      }))
      .filter((c) => c.remaining >= args.gc_amount_used! - 0.5)
      .sort((a, b) =>
        args.gc_face_value
          ? Math.abs(a.face_value - args.gc_face_value) - Math.abs(b.face_value - args.gc_face_value)
          : a.remaining - b.remaining
      );
    const card = usable[0];
    if (card) {
      await supabase.from("movie_gift_cards").insert({
        movie_id: movieId,
        gift_card_id: card.id,
        amount_used: args.gc_amount_used,
        purpose: args.gc_purpose === "fnb" ? "fnb" : "ticket",
      } as never);
      gcNote = `${card.platform?.name || "GC"} \u20b9${args.gc_amount_used} linked (${args.gc_purpose === "fnb" ? "F&B" : "ticket"})`;
    } else {
      gcNote = "no gift card with enough balance found — link it in the app";
    }
  }

  // Rating last so the value score sees the GC usage.
  let ratingResult: { valueScore: number | null; tierLabel: string | null } | null = null;
  if (args.rating && args.rating >= 1 && args.rating <= 10) {
    ratingResult = await applyRatingInternal(movieId, args.rating);
  }

  await logBotEdit("movies", movieId, {
    __created__: { old: null, new: { title: args.title, date: row.date } },
  });

  return {
    logged: args.title,
    date: row.date,
    theater: theater?.name || args.theater || null,
    format: format?.name || args.format || "2D",
    tmdbMatched: Boolean(tmdbFields.poster_url),
    giftCard: gcNote,
    rating: args.rating || null,
    valueScore: ratingResult?.valueScore ?? null,
    valueTier: ratingResult?.tierLabel ?? null,
  };
}

async function toolMovieDetails(args: { title: string }): Promise<unknown> {
  const match = await findMovieByTitle(args.title || "");
  if (!match) return { error: `no logged movie matching "${args.title}"` };
  const supabase = serviceClient();
  if (!supabase) return { error: "no database access" };
  const { data } = await supabase
    .from("movies")
    .select("title,date,showtime,rating,review,remarks,value_score,ticket_cost,convenience_fee,fnb_cost,fnb_items,other_expenses,total_cost,seat,audi,occupancy,language,genres,director,runtime_minutes,tmdb_rating,theater:theaters(name),format:formats(name),movie_gift_cards(amount_used,purpose,gift_card:gift_cards(discount_percent))")
    .eq("id", match.id)
    .maybeSingle();
  return data || { error: "movie not found" };
}

async function toolUpdateMovie(args: Record<string, unknown> & { title?: string }): Promise<unknown> {
  const match = await findMovieByTitle(String(args.title || ""));
  if (!match) return { error: `no logged movie matching "${args.title}"` };
  const result = await updateMovieFields(match.id, args);
  return result;
}

async function toolGetWatchlist(): Promise<unknown> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return { error: "no database access" };
  const { data } = await supabase
    .from("watchlist")
    .select("title,priority,release_date,created_at")
    .eq("user_id", userId)
    .is("watched_movie_id", null)
    .order("priority", { ascending: false });
  return data || [];
}

async function toolUpdateGiftCard(args: {
  face_value?: number;
  platform?: string;
  amount_paid?: number;
  expiry_date?: string;
}): Promise<unknown> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return { error: "no database access" };
  const { data } = await supabase
    .from("gift_cards")
    .select("id,face_value,amount_paid,expiry_date,platform:platforms(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  const cards = (data || []) as unknown as Array<{
    id: string; face_value: number; amount_paid: number; expiry_date: string;
    platform: { name: string } | null;
  }>;
  const card = cards.find(
    (c) =>
      (!args.face_value || Math.abs(c.face_value - args.face_value) < 1) &&
      (!args.platform || norm(c.platform?.name || "").includes(norm(args.platform)))
  );
  if (!card) return { error: "no matching gift card (give face value and/or platform)" };

  const updates: Record<string, unknown> = {};
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  if (typeof args.amount_paid === "number" && args.amount_paid > 0 && args.amount_paid !== card.amount_paid) {
    updates.amount_paid = args.amount_paid;
    changes.amount_paid = { old: card.amount_paid, new: args.amount_paid };
  }
  if (args.expiry_date && args.expiry_date !== card.expiry_date) {
    updates.expiry_date = args.expiry_date;
    changes.expiry_date = { old: card.expiry_date, new: args.expiry_date };
  }
  if (Object.keys(updates).length === 0) return { error: "nothing to update (amount_paid / expiry_date)" };
  const { error } = await supabase.from("gift_cards").update(updates as never).eq("id", card.id);
  if (error) return { error: error.message };
  await logBotEdit("gift_cards", card.id, changes);
  return { updated: card.platform?.name || "GC", face_value: card.face_value, changes };
}

async function toolUndoLastEdit(): Promise<unknown> {
  const supabase = serviceClient();
  if (!supabase) return { error: "no database access" };
  const { data } = await supabase
    .from("bot_edits")
    .select("id,table_name,record_id,changes,created_at")
    .eq("undone", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { error: "no bot edits to undo" };
  const edit = data as unknown as {
    id: string; table_name: string; record_id: string;
    changes: Record<string, { old: unknown; new: unknown }>; created_at: string;
  };
  if (edit.changes.__created__) {
    return { error: "the last edit was a movie creation — deletions aren't allowed from the bot; remove it in the app if needed" };
  }
  const restore: Record<string, unknown> = {};
  for (const [field, change] of Object.entries(edit.changes)) restore[field] = change.old;
  const { error } = await supabase.from(edit.table_name).update(restore as never).eq("id", edit.record_id);
  if (error) return { error: error.message };
  await supabase.from("bot_edits").update({ undone: true } as never).eq("id", edit.id);
  return { restored: edit.table_name, record: edit.record_id, revertedFields: Object.keys(edit.changes), editWasFrom: edit.created_at };
}

async function toolRateMovie(args: { title: string; rating: number }): Promise<unknown> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return { error: "no database access" };
  if (!args.title || !args.rating || args.rating < 1 || args.rating > 10) {
    return { error: "need a title and a rating between 1 and 10" };
  }
  const { data } = await supabase
    .from("movies")
    .select("id,title,date")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(60);
  const wanted = norm(args.title);
  const match = ((data || []) as Array<{ id: string; title: string; date: string }>).find(
    (m) => norm(m.title) === wanted || norm(m.title).includes(wanted) || wanted.includes(norm(m.title))
  );
  if (!match) return { error: `no logged movie matching "${args.title}"` };
  const result = await applyRating(match.id, args.rating);
  // (applyRating writes the audit row itself)
  return result
    ? { rated: result.title, rating: args.rating, valueScore: result.valueScore, valueTier: result.tierLabel }
    : { error: "failed to save rating" };
}

async function toolAddToWatchlist(args: { title: string }): Promise<unknown> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return { error: "no database access" };
  if (!args.title) return { error: "need a title" };
  const { error } = await supabase
    .from("watchlist")
    .insert({ user_id: userId, title: args.title, priority: 1 } as never);
  return error ? { error: error.message } : { added: args.title };
}

const FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "get_recommendations",
    description:
      "Live PVR Lucknow data: personalized now-showing picks (predicted rating for the user, showtimes, prices, value scores, hall occupancy, booking links) and upcoming releases. Optional query filters by movie title.",
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING, description: "Optional title filter" } },
    },
  },
  {
    name: "get_gift_cards",
    description: "The user's gift cards: remaining balance, discount percent, expiry date.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_recent_movies",
    description: "The user's movie log, newest first: title, date, rating, value score, cost, theater, format.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: { type: Type.NUMBER, description: "Max rows (default 25, max 100)" },
        since: { type: Type.STRING, description: "Only movies on/after this date (YYYY-MM-DD)" },
        until: { type: Type.STRING, description: "Only movies on/before this date (YYYY-MM-DD). Use since+until together for month/week questions." },
      },
    },
  },
  {
    name: "get_stats",
    description: "Aggregates over the log: movie count, total/F&B spend, gift-card savings, average rating, top genres. Optionally for one year.",
    parameters: {
      type: Type.OBJECT,
      properties: { year: { type: Type.NUMBER, description: "Calendar year, omit for all-time" } },
    },
  },
  {
    name: "log_movie",
    description:
      "Log a WATCHED movie from conversation with everything known: title (required), date (YYYY-MM-DD), showtime (HH:MM 24h), theater name, format (2D/IMAX 2D/...), ticket_cost, convenience_fee, fnb_cost + fnb_items, other_expenses, seat, audi, rating, review. Optionally link a gift card: gc_amount_used + gc_purpose ('ticket'|'fnb') + gc_face_value to pick the card. Enriches from TMDB automatically.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        date: { type: Type.STRING },
        showtime: { type: Type.STRING },
        theater: { type: Type.STRING },
        format: { type: Type.STRING },
        ticket_cost: { type: Type.NUMBER },
        convenience_fee: { type: Type.NUMBER },
        fnb_cost: { type: Type.NUMBER },
        fnb_items: { type: Type.STRING },
        other_expenses: { type: Type.NUMBER },
        seat: { type: Type.STRING },
        audi: { type: Type.STRING },
        rating: { type: Type.NUMBER },
        review: { type: Type.STRING },
        gc_amount_used: { type: Type.NUMBER },
        gc_purpose: { type: Type.STRING },
        gc_face_value: { type: Type.NUMBER },
      },
      required: ["title"],
    },
  },
  {
    name: "get_movie_details",
    description: "Full details of one logged movie by title: review, remarks, all costs, seat, occupancy, value score, gift-card usage.",
    parameters: {
      type: Type.OBJECT,
      properties: { title: { type: Type.STRING } },
      required: ["title"],
    },
  },
  {
    name: "update_movie",
    description:
      "Edit a logged movie (matched by title). Editable: rating, review, remarks, fnb_cost, other_expenses, ticket_cost, convenience_fee, seat, audi, showtime (HH:MM), date (YYYY-MM-DD). Value score recomputes automatically. Every change is audit-logged and reversible via undo_last_edit.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        rating: { type: Type.NUMBER },
        review: { type: Type.STRING },
        remarks: { type: Type.STRING },
        fnb_cost: { type: Type.NUMBER },
        other_expenses: { type: Type.NUMBER },
        ticket_cost: { type: Type.NUMBER },
        convenience_fee: { type: Type.NUMBER },
        seat: { type: Type.STRING },
        audi: { type: Type.STRING },
        showtime: { type: Type.STRING },
        date: { type: Type.STRING },
      },
      required: ["title"],
    },
  },
  {
    name: "get_watchlist",
    description: "The user's unwatched watchlist with priorities and release dates.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "update_gift_card",
    description: "Edit a gift card matched by face value and/or platform: set amount_paid (actual purchase price, for discount tracking) or expiry_date.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        face_value: { type: Type.NUMBER },
        platform: { type: Type.STRING },
        amount_paid: { type: Type.NUMBER },
        expiry_date: { type: Type.STRING },
      },
    },
  },
  {
    name: "undo_last_edit",
    description: "Revert the most recent edit the bot made (any table), restoring previous values from the audit log.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "rate_movie",
    description: "Save the user's rating (1-10, halves allowed) for a logged movie, matched by title. Also recomputes its value score.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        rating: { type: Type.NUMBER },
      },
      required: ["title", "rating"],
    },
  },
  {
    name: "add_to_watchlist",
    description: "Add a movie title to the user's watchlist.",
    parameters: {
      type: Type.OBJECT,
      properties: { title: { type: Type.STRING } },
      required: ["title"],
    },
  },
];

const TOOL_IMPL: Record<string, (args: never) => Promise<unknown>> = {
  get_recommendations: toolRecommendations,
  get_gift_cards: toolGiftCards,
  get_recent_movies: toolRecentMovies,
  get_stats: toolStats,
  log_movie: toolLogMovie,
  get_movie_details: toolMovieDetails,
  update_movie: toolUpdateMovie,
  get_watchlist: toolGetWatchlist,
  update_gift_card: toolUpdateGiftCard,
  undo_last_edit: toolUndoLastEdit,
  rate_movie: toolRateMovie,
  add_to_watchlist: toolAddToWatchlist,
};

interface HistoryTurn {
  role: "user" | "model";
  text: string;
}

export async function converse(userText: string): Promise<string> {
  const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey) return "AI isn't configured (missing GOOGLE_CLOUD_API_KEY).";
  const ai = new GoogleGenAI({ apiKey });

  const history = (await getBotState<HistoryTurn[]>(HISTORY_KEY)) || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents: any[] = [
    ...history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
    { role: "user", parts: [{ text: userText }] },
  ];

  currentUserMessage = userText;
  const systemInstruction = [
    "You are CinemaLog, Divyansh's personal cinema assistant on Telegram.",
    `Today is ${istDateString()} (IST). He watches movies at PVR/INOX in Lucknow and pays with discounted gift cards.`,
    "ACCURACY RULES (non-negotiable):",
    "- Every fact about his log, spending, gift cards, showtimes, or ratings MUST come from a tool result in THIS turn. Never answer from memory or prior turns.",
    "- NEVER invent movies, dates, or numbers. For month/period questions call get_recent_movies with since+until covering that period; an empty result means he watched nothing then — say exactly that.",
    "- get_recent_movies returns logStartsOn; anything before that date does not exist in the log.",
    "- For superlatives (worst/best/most expensive in a period) fetch that period's movies first, then compare only what came back.",
    "- If a title or card is ambiguous, ask instead of guessing. After any edit, report exactly what changed (old -> new).",
    "LOGGING & EDITING: log_movie logs a watched movie from conversation with every detail he gives (date, costs, gift card usage, rating, review) — you CAN log movies, never claim otherwise. update_movie edits rating/review/remarks/costs/seat/showtime/date; update_gift_card fixes amount_paid or expiry; rate_movie is a rating shortcut; add_to_watchlist adds titles. All writes are audit-logged; undo_last_edit reverts the latest one when he says undo/revert.",
    "Style: plain text only (no markdown, no HTML tags). Telegram-short — a few lines, not essays.",
    "Prices are in rupees (₹). Predicted ratings are personalized to his taste; value tiers run Bargain/Great value/Fair/Stretch/Splurge.",
    "You may include a bare booking URL when recommending a specific show.",
  ].join("\n");

  let finalText = "";
  let modelIndex = 0;
  for (let round = 0; round < 6; round += 1) {
    const model = MODELS[modelIndex];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response: any;
    try {
      response = await ai.models.generateContent({
        model,
        config: {
          systemInstruction,
          temperature: 0.2,
          tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
          // Gemini 2.x rejects thinkingLevel; only the 3.x models take it.
          ...(model.startsWith("gemini-3")
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
        },
        contents,
      });
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status === 429 && modelIndex < MODELS.length - 1) {
        // Quota hit: switch model and restart the conversation turn cleanly
        // (thought signatures don't transfer between models).
        modelIndex += 1;
        contents.length = 0;
        contents.push(
          ...history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
          { role: "user", parts: [{ text: userText }] }
        );
        continue;
      }
      if (status === 429) {
        return "Gemini's free-tier quota is exhausted for today — the buttons and /tonight, /gc, /recap still work. Chat resets at midnight PT (or enable billing on the Google AI key for effectively unlimited use).";
      }
      throw error;
    }

    const calls = response.functionCalls;
    const modelContent = response.candidates?.[0]?.content;
    if (calls && calls.length > 0 && modelContent) {
      // Echo the model's own content back verbatim — Gemini 3 requires the
      // thoughtSignature attached to each functionCall part to be preserved.
      contents.push(modelContent);
      const responseParts = [];
      for (const call of calls) {
        const impl = TOOL_IMPL[call.name || ""];
        let result: unknown;
        try {
          result = impl ? await impl((call.args || {}) as never) : { error: `unknown tool ${call.name}` };
        } catch (error) {
          result = { error: error instanceof Error ? error.message : "tool failed" };
        }
        responseParts.push({
          functionResponse: { name: call.name, response: { result } },
        });
      }
      contents.push({ role: "user", parts: responseParts });
      continue;
    }

    finalText = response.text || "";
    break;
  }

  if (!finalText) finalText = "I got stuck on that one — try rephrasing?";

  const nextHistory: HistoryTurn[] = [
    ...history,
    { role: "user" as const, text: userText },
    { role: "model" as const, text: finalText.slice(0, 1500) },
  ].slice(-MAX_HISTORY_TURNS);
  await setBotState(HISTORY_KEY, nextHistory);

  return finalText;
}
