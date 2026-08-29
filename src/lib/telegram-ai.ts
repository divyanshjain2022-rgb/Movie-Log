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

// Free-tier Gemini quotas are per-model per-day (a flash model allows only 20
// requests/day), so exhausting one model falls through to the next. Newest
// first: each step down is a real capability drop, and the daily budget is
// four models deep rather than one model wide.
const MODELS = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
];
const HISTORY_KEY = "chat_history";
const MAX_HISTORY_TURNS = 16;

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Tables whose rows the user refers to by name in chat, never by id.
type NamedTable = "formats" | "theaters" | "moods" | "aspects" | "rewatch_options" | "franchises" | "companions";

// Resolve a spoken name to a row of the user's own. Token match: every token
// of the stored name must appear in what was said, and the most specific
// match wins, so "IMAX 2D" beats "IMAX" for "the imax 2d show".
async function resolveNamed(
  table: NamedTable,
  wanted: string
): Promise<{ id: string; name: string } | null> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId || !wanted) return null;
  const { data } = await supabase.from(table).select("id,name").eq("user_id", userId);
  const wantedNorm = norm(wanted);
  return (
    ((data || []) as Array<{ id: string; name: string }>)
      .map((row) => {
        const tokens = norm(row.name).split(" ").filter(Boolean);
        return { row, score: tokens.every((t) => wantedNorm.includes(t)) ? tokens.length : 0 };
      })
      .sort((a, b) => b.score - a.score)
      .find((x) => x.score > 0)?.row || null
  );
}

// The names of a user's own rows, for telling the model what it may pick from.
async function namesIn(table: NamedTable): Promise<string[]> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return [];
  const { data } = await supabase.from(table).select("name").eq("user_id", userId);
  return ((data || []) as Array<{ name: string }>).map((r) => r.name);
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
  "watched_with", "is_rewatch", "status", "language", "director", "booking_id",
] as const;

// Fields given as names in chat, stored as ids. Each maps to the table its
// name resolves against.
const RELATIONAL_MOVIE_FIELDS: Array<{ arg: string; column: string; table: NamedTable }> = [
  { arg: "format", column: "format_id", table: "formats" },
  { arg: "theater", column: "theater_id", table: "theaters" },
  { arg: "mood", column: "mood_id", table: "moods" },
  { arg: "strongest_part", column: "strongest_part_id", table: "aspects" },
  { arg: "weakest_part", column: "weakest_part_id", table: "aspects" },
  { arg: "rewatch", column: "rewatch_id", table: "rewatch_options" },
  { arg: "franchise", column: "franchise_id", table: "franchises" },
];
const SCORE_FIELDS = new Set([
  "rating", "fnb_cost", "other_expenses", "ticket_cost", "convenience_fee", "format_id",
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

  // Relational fields arrive as names and resolve to ids against the user's
  // own tables. An unresolvable name is an error, never a silent no-op: the
  // model would otherwise report an edit that never happened.
  const nameChanges: Record<string, { old: unknown; new: unknown }> = {};
  for (const { arg, column, table } of RELATIONAL_MOVIE_FIELDS) {
    const wanted = updates[arg];
    if (typeof wanted !== "string" || !wanted) continue;
    const match = await resolveNamed(table, wanted);
    if (!match) {
      const options = (await namesIn(table)).join(", ");
      return { error: `no ${arg} matching "${wanted}"${options ? ` — options are: ${options}` : ""}` };
    }
    filtered[column] = match.id;
    nameChanges[arg] = { old: null, new: match.name };
  }

  if (Object.keys(filtered).length === 0) return { error: "no editable fields provided" };
  if (typeof filtered.rating === "number" && (filtered.rating < 1 || filtered.rating > 10)) {
    return { error: "rating must be between 1 and 10" };
  }
  if (filtered.status !== undefined && filtered.status !== "watched" && filtered.status !== "upcoming") {
    return { error: 'status must be "watched" or "upcoming"' };
  }
  if (filtered.is_rewatch !== undefined && typeof filtered.is_rewatch !== "boolean") {
    return { error: "is_rewatch must be true or false" };
  }

  const { data: before } = await supabase
    .from("movies")
    .select("title,rating,review,remarks,fnb_cost,fnb_items,other_expenses,ticket_cost,convenience_fee,seat,audi,showtime,date,watched_with,is_rewatch,status,language,director,booking_id,value_score,format_id,theater_id,mood_id,strongest_part_id,weakest_part_id,rewatch_id,franchise_id,format:formats(name),theater:theaters(name),mood:moods(name),strongest_part:aspects!movies_strongest_part_id_fkey(name),weakest_part:aspects!movies_weakest_part_id_fkey(name),rewatch:rewatch_options(name),franchise:franchises(name)")
    .eq("id", movieId)
    .maybeSingle();
  if (!before) return { error: "movie not found" };
  const beforeRow = before as Record<string, unknown> & { title: string; value_score: number | null };

  const beforeNames = beforeRow as unknown as Record<string, { name: string } | null>;
  const columnToArg = new Map(RELATIONAL_MOVIE_FIELDS.map((f) => [f.column, f.arg]));
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const [field, value] of Object.entries(filtered)) {
    if (beforeRow[field] === value) continue;
    const arg = columnToArg.get(field);
    if (arg) {
      // Store both: the id is what undo restores, the name is what the model
      // reports back to the user. `*_name` entries are display-only.
      changes[field] = { old: beforeRow[field] ?? null, new: value };
      changes[`${arg}_name`] = {
        old: beforeNames[arg]?.name ?? null,
        new: nameChanges[arg]?.new ?? null,
      };
    } else {
      changes[field] = { old: beforeRow[field] ?? null, new: value };
    }
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

async function toolRecommendations(args: {
  query?: string;
  date?: string;
  format?: string;
  language?: string;
  time?: string;
}): Promise<unknown> {
  const secret = process.env.CRON_SECRET;
  const params = new URLSearchParams({ city: "Lucknow" });
  if (args.query) params.set("text", args.query);
  if (args.date) params.set("date", args.date);
  if (args.format) params.set("format", args.format);
  if (args.language) params.set("language", args.language);
  if (args.time) params.set("time", args.time);
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
        show: { showDate: string; showTime: string; cinemaName: string; format: string; redirectUrl: string };
        displayPrice: number | null;
        valueScore: number;
        occupancyPercent: number | null;
      }>;
    }>;
    upcoming: Array<{ title: string; releaseDate: string | null; onWatchlist?: boolean }>;
  };
  return {
    showtimesDate: args.date || istDateString(),
    filters: {
      format: args.format || "ALL",
      language: args.language || "ALL",
      time: args.time || "ALL",
    },
    nowShowing: (payload.recommendations || []).slice(0, 8).map((rec) => ({
      title: rec.movie.title,
      genres: rec.movie.genres,
      languages: rec.movie.languages,
      predictedRatingForUser: rec.predictedRating,
      whyRecommended: rec.reasons,
      shows: rec.options.slice(0, 3).map((option) => ({
        date: option.show.showDate,
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

// Everything the log records about a watch, except the long TMDB prose
// (overview, keywords, cast) — those are per-movie questions, and 25 of them
// would crowd out the numbers the model is usually being asked about.
const MOVIE_LIST_FIELDS =
  "title,date,showtime,rating,value_score,total_cost,ticket_cost,convenience_fee,fnb_cost,fnb_items," +
  "other_expenses,passport_savings,seat,audi,occupancy,language,genres,director,runtime_minutes," +
  "tmdb_rating,certification,release_date,status,is_rewatch,watched_with,review,remarks," +
  "theater:theaters(name),format:formats(name),mood:moods(name),franchise:franchises(name)," +
  "rewatch:rewatch_options(name),strongest_part:aspects!movies_strongest_part_id_fkey(name)," +
  "weakest_part:aspects!movies_weakest_part_id_fkey(name)," +
  "movie_companions(companion:companions(name))," +
  "movie_gift_cards(amount_used,purpose,gift_card:gift_cards(discount_percent))";

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
    .select(MOVIE_LIST_FIELDS)
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

async function toolStats(args: {
  year?: number;
  since?: string;
  until?: string;
}): Promise<unknown> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return { error: "no database access" };
  const { data } = await supabase
    .from("movies")
    .select(
      "date,rating,total_cost,fnb_cost,ticket_cost,other_expenses,passport_savings,genres,language,occupancy,is_rewatch," +
        "theater:theaters(name),format:formats(name),mood:moods(name)," +
        "movie_companions(companion:companions(name))," +
        "movie_gift_cards(amount_used,gift_card:gift_cards(discount_percent))"
    )
    .eq("user_id", userId);
  let rows = (data || []) as unknown as Array<{
    date: string;
    rating: number | null;
    total_cost: number;
    fnb_cost: number | null;
    ticket_cost: number | null;
    other_expenses: number | null;
    passport_savings: number | null;
    genres: string[] | null;
    language: string | null;
    occupancy: number | null;
    is_rewatch: boolean | null;
    theater: { name: string } | null;
    format: { name: string } | null;
    mood: { name: string } | null;
    movie_companions: Array<{ companion: { name: string } | null }> | null;
    movie_gift_cards: Array<{ amount_used: number; gift_card: { discount_percent: number | null } | null }> | null;
  }>;
  if (args.year) rows = rows.filter((m) => new Date(m.date).getFullYear() === args.year);
  if (args.since) rows = rows.filter((m) => m.date >= args.since!);
  if (args.until) rows = rows.filter((m) => m.date <= args.until!);

  const rated = rows.filter((m) => (m.rating || 0) > 0);
  const sum = (pick: (m: (typeof rows)[number]) => number) =>
    Math.round(rows.reduce((total, m) => total + pick(m), 0));

  // count / spend / mean rating per label, biggest spend first — one shape for
  // every breakdown so the model doesn't have to learn several.
  const groupBy = (label: (m: (typeof rows)[number]) => string[]) => {
    const buckets: Record<string, { movies: number; spend: number; ratingSum: number; ratingCount: number }> = {};
    for (const movie of rows) {
      for (const key of label(movie)) {
        if (!key) continue;
        const bucket = (buckets[key] ||= { movies: 0, spend: 0, ratingSum: 0, ratingCount: 0 });
        bucket.movies += 1;
        bucket.spend += movie.total_cost;
        if ((movie.rating || 0) > 0) {
          bucket.ratingSum += movie.rating!;
          bucket.ratingCount += 1;
        }
      }
    }
    return Object.entries(buckets)
      .map(([name, b]) => ({
        name,
        movies: b.movies,
        spend: Math.round(b.spend),
        avgRating: b.ratingCount ? +(b.ratingSum / b.ratingCount).toFixed(1) : null,
      }))
      .sort((a, b) => b.spend - a.spend);
  };

  const months: Record<string, { movies: number; spend: number }> = {};
  for (const movie of rows) {
    const key = movie.date.slice(0, 7);
    const bucket = (months[key] ||= { movies: 0, spend: 0 });
    bucket.movies += 1;
    bucket.spend += movie.total_cost;
  }

  const withOccupancy = rows.filter((m) => typeof m.occupancy === "number");

  return {
    movies: rows.length,
    rewatches: rows.filter((m) => m.is_rewatch).length,
    totalSpend: sum((m) => m.total_cost),
    ticketSpend: sum((m) => m.ticket_cost || 0),
    fnbSpend: sum((m) => m.fnb_cost || 0),
    otherSpend: sum((m) => m.other_expenses || 0),
    passportSaved: sum((m) => m.passport_savings || 0),
    gcSaved: sum((m) =>
      (m.movie_gift_cards || []).reduce(
        (x, g) => x + g.amount_used * ((g.gift_card?.discount_percent || 0) / 100),
        0
      )
    ),
    avgCostPerMovie: rows.length ? Math.round(rows.reduce((s2, m) => s2 + m.total_cost, 0) / rows.length) : null,
    avgRating: rated.length ? +(rated.reduce((s2, m) => s2 + (m.rating || 0), 0) / rated.length).toFixed(1) : null,
    avgOccupancy: withOccupancy.length
      ? Math.round(withOccupancy.reduce((s2, m) => s2 + (m.occupancy || 0), 0) / withOccupancy.length)
      : null,
    byMonth: Object.entries(months)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, b]) => ({ month, movies: b.movies, spend: Math.round(b.spend) })),
    byTheater: groupBy((m) => [m.theater?.name || ""]),
    byFormat: groupBy((m) => [m.format?.name || ""]),
    byLanguage: groupBy((m) => [m.language || ""]),
    byGenre: groupBy((m) => m.genres || []),
    byMood: groupBy((m) => [m.mood?.name || ""]),
    byCompanion: groupBy((m) => (m.movie_companions || []).map((c) => c.companion?.name || "")),
    note:
      "totalSpend is the complete figure: it ALREADY includes fnbSpend, ticketSpend and otherSpend, minus passport savings. " +
      "Never add these to totalSpend — that double-counts. A movie appears in every genre and companion it has, so those " +
      "breakdowns sum to more than the total; theater, format, language and mood are one bucket per movie.",
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
  const { data, error } = await supabase
    .from("watchlist")
    // added_at, not created_at: this select asked for a column that does not
    // exist, PostgREST rejected the whole query, and `data || []` turned that
    // into an empty watchlist on every question.
    .select("id,title,priority,release_date,genres,runtime_minutes,notes,added_at")
    .eq("user_id", userId)
    .is("watched_movie_id", null)
    .order("priority", { ascending: false })
    .order("added_at", { ascending: false });
  if (error) return { error: error.message };
  return {
    items: data || [],
    note: "priority is 2 = high, 1 = normal, 0 = low. Watched items are excluded.",
  };
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

  // A removal stored the whole row, so undoing it is a re-insert, not an
  // update. This is the only path that puts a deleted row back.
  if (edit.changes.__deleted__) {
    const row = edit.changes.__deleted__.old as Record<string, unknown> | null;
    if (!row) return { error: "that removal didn't record enough to restore" };
    const { error } = await supabase.from(edit.table_name).insert(row as never);
    if (error) return { error: error.message };
    await supabase.from("bot_edits").update({ undone: true } as never).eq("id", edit.id);
    return { restored: edit.table_name, reinserted: row.title || row.name || edit.record_id, editWasFrom: edit.created_at };
  }

  const restore: Record<string, unknown> = {};
  for (const [field, change] of Object.entries(edit.changes)) {
    // `*_name` entries exist so the model can say what changed in words; the
    // id alongside them is the real column.
    if (field.endsWith("_name") && `${field.slice(0, -5)}_id` in edit.changes) continue;
    restore[field] = change.old;
  }
  const { error } = await supabase.from(edit.table_name).update(restore as never).eq("id", edit.record_id);
  if (error) return { error: error.message };
  await supabase.from("bot_edits").update({ undone: true } as never).eq("id", edit.id);
  return { restored: edit.table_name, record: edit.record_id, revertedFields: Object.keys(restore), editWasFrom: edit.created_at };
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

// ---- Passports, budgets, companions, F&B line items, franchises, halls ----
//
// These six tables were invisible to the bot. The system prompt forbids
// answering from memory, so "how much has the passport saved me?" wasn't a
// vague answer, it was a flat refusal.

async function toolPassports(): Promise<unknown> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return { error: "no database access" };
  const [{ data: passports, error }, { data: uses }] = await Promise.all([
    supabase
      .from("passports")
      .select("id,name,purchase_date,expiry_date,amount_paid,total_uses,notes,is_active")
      .eq("user_id", userId)
      .order("purchase_date", { ascending: false }),
    supabase
      .from("movies")
      .select("passport_id,passport_savings,date,title")
      .eq("user_id", userId)
      .not("passport_id", "is", null),
  ]);
  if (error) return { error: error.message };
  const rows = (uses || []) as unknown as Array<{
    passport_id: string; passport_savings: number | null; date: string; title: string;
  }>;
  const today = istDateString();
  return {
    passports: ((passports || []) as unknown as Array<Record<string, unknown>>).map((pass) => {
      const mine = rows.filter((m) => m.passport_id === pass.id);
      const used = mine.length;
      const totalUses = (pass.total_uses as number) || 0;
      const saved = Math.round(mine.reduce((sum, m) => sum + (m.passport_savings || 0), 0));
      const expiry = pass.expiry_date as string | null;
      return {
        name: pass.name,
        purchaseDate: pass.purchase_date,
        expiryDate: expiry,
        expired: expiry ? expiry < today : false,
        amountPaid: pass.amount_paid,
        usesTotal: totalUses,
        usesSpent: used,
        usesLeft: Math.max(totalUses - used, 0),
        saved,
        netSoFar: Math.round(saved - ((pass.amount_paid as number) || 0)),
        isActive: pass.is_active,
        notes: pass.notes,
        usedOn: mine.map((m) => ({ title: m.title, date: m.date, saved: m.passport_savings })),
      };
    }),
    note: "netSoFar is savings minus what the passport cost — negative means it hasn't paid for itself yet.",
  };
}

async function toolBudgets(args: { year?: number }): Promise<unknown> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return { error: "no database access" };
  const [{ data: budgets, error }, { data: spend }] = await Promise.all([
    supabase.from("budgets").select("month,year,amount").eq("user_id", userId),
    supabase.from("movies").select("date,total_cost").eq("user_id", userId),
  ]);
  if (error) return { error: error.message };
  const movies = (spend || []) as unknown as Array<{ date: string; total_cost: number }>;
  const rows = ((budgets || []) as unknown as Array<{ month: number; year: number; amount: number }>)
    .filter((b) => !args.year || b.year === args.year)
    .sort((a, b) => b.year - a.year || b.month - a.month);
  return {
    budgets: rows.map((b) => {
      const prefix = `${b.year}-${String(b.month).padStart(2, "0")}`;
      const spent = Math.round(
        movies.filter((m) => m.date.startsWith(prefix)).reduce((sum, m) => sum + m.total_cost, 0)
      );
      return {
        month: prefix,
        budget: b.amount,
        spent,
        remaining: Math.round(b.amount - spent),
        overBudget: spent > b.amount,
      };
    }),
    note: "Months with no row here have no budget set — that is not a budget of zero.",
  };
}

async function toolCompanions(): Promise<unknown> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return { error: "no database access" };
  const { data, error } = await supabase
    .from("companions")
    .select("id,name,avatar_emoji,movie_companions(movie:movies(title,date,rating,total_cost))")
    .eq("user_id", userId);
  if (error) return { error: error.message };
  return ((data || []) as unknown as Array<{
    name: string;
    avatar_emoji: string;
    movie_companions: Array<{ movie: { title: string; date: string; rating: number | null; total_cost: number } | null }> | null;
  }>).map((c) => {
    const seen = (c.movie_companions || []).map((mc) => mc.movie).filter(Boolean) as Array<{
      title: string; date: string; rating: number | null; total_cost: number;
    }>;
    const rated = seen.filter((m) => (m.rating || 0) > 0);
    return {
      name: c.name,
      emoji: c.avatar_emoji,
      moviesTogether: seen.length,
      lastSeen: seen.map((m) => m.date).sort().at(-1) || null,
      avgRating: rated.length ? +(rated.reduce((s, m) => s + (m.rating || 0), 0) / rated.length).toFixed(1) : null,
      spend: Math.round(seen.reduce((s, m) => s + m.total_cost, 0)),
      movies: seen.map((m) => ({ title: m.title, date: m.date, rating: m.rating })),
    };
  });
}

async function toolFnbBreakdown(args: { since?: string; until?: string }): Promise<unknown> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return { error: "no database access" };
  let query = supabase
    .from("fnb_purchases")
    .select("id,date,items,cost,remarks,theater:theaters(name),movie:movies(title),fnb_purchase_items(item_name,quantity,price)")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(200);
  if (args.since) query = query.gte("date", args.since);
  if (args.until) query = query.lte("date", args.until);
  const { data, error } = await query;
  if (error) return { error: error.message };
  const purchases = (data || []) as unknown as Array<{
    date: string; items: string; cost: number; remarks: string | null;
    theater: { name: string } | null;
    movie: { title: string } | null;
    fnb_purchase_items: Array<{ item_name: string; quantity: number; price: number }> | null;
  }>;

  // Per-item totals across the window — the question is almost always "what do
  // I actually keep buying", which the free-text `items` column can't answer.
  const byItem: Record<string, { qty: number; spend: number; times: number }> = {};
  for (const purchase of purchases) {
    for (const line of purchase.fnb_purchase_items || []) {
      const bucket = (byItem[line.item_name] ||= { qty: 0, spend: 0, times: 0 });
      bucket.qty += line.quantity;
      bucket.spend += line.price * line.quantity;
      bucket.times += 1;
    }
  }
  return {
    totalSpend: Math.round(purchases.reduce((s, p) => s + p.cost, 0)),
    purchases: purchases.map((p) => ({
      date: p.date,
      movie: p.movie?.title || null,
      theater: p.theater?.name || null,
      cost: p.cost,
      items: (p.fnb_purchase_items || []).length ? p.fnb_purchase_items : p.items,
      remarks: p.remarks,
    })),
    byItem: Object.entries(byItem)
      .map(([name, b]) => ({ name, quantity: b.qty, spend: Math.round(b.spend), purchases: b.times }))
      .sort((a, b) => b.spend - a.spend),
    note: "Only purchases with itemised lines appear in byItem; older ones have a free-text items string instead.",
  };
}

async function toolFranchises(): Promise<unknown> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return { error: "no database access" };
  const { data, error } = await supabase
    .from("franchises")
    .select("name,movies(title,date,rating,total_cost,is_rewatch)")
    .eq("user_id", userId);
  if (error) return { error: error.message };
  return ((data || []) as unknown as Array<{
    name: string;
    movies: Array<{ title: string; date: string; rating: number | null; total_cost: number; is_rewatch: boolean | null }> | null;
  }>).map((f) => {
    const seen = f.movies || [];
    const rated = seen.filter((m) => (m.rating || 0) > 0);
    return {
      name: f.name,
      watched: seen.length,
      avgRating: rated.length ? +(rated.reduce((s, m) => s + (m.rating || 0), 0) / rated.length).toFixed(1) : null,
      spend: Math.round(seen.reduce((s, m) => s + m.total_cost, 0)),
      movies: seen
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((m) => ({ title: m.title, date: m.date, rating: m.rating, isRewatch: m.is_rewatch })),
    };
  });
}

async function toolTheaterRatings(): Promise<unknown> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return { error: "no database access" };
  const { data, error } = await supabase
    .from("theater_ratings")
    .select("audi,sound,seat,screen,cleanliness,notes,created_at,theater:theaters(name),movie:movies(title,date)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return { error: error.message };
  const rows = (data || []) as unknown as Array<{
    audi: string | null; sound: number | null; seat: number | null; screen: number | null;
    cleanliness: number | null; notes: string | null; created_at: string;
    theater: { name: string } | null; movie: { title: string; date: string } | null;
  }>;
  const scored = (r: (typeof rows)[number]) =>
    [r.sound, r.seat, r.screen, r.cleanliness].filter((n): n is number => typeof n === "number");
  return {
    ratings: rows.map((r) => {
      const parts = scored(r);
      return {
        theater: r.theater?.name || null,
        audi: r.audi,
        sound: r.sound,
        seat: r.seat,
        screen: r.screen,
        cleanliness: r.cleanliness,
        overall: parts.length ? +(parts.reduce((a, b) => a + b, 0) / parts.length).toFixed(1) : null,
        notes: r.notes,
        ratedAfter: r.movie ? `${r.movie.title} (${r.movie.date})` : null,
        ratedOn: r.created_at.slice(0, 10),
      };
    }),
    note: "Each sub-score is 1-5. A hall (audi) can be rated more than once; the newest row is first.",
  };
}

// ---- Writes: budgets, passports, companions, hall ratings, watchlist ----
//
// Same contract as the movie editor: whitelisted fields, an audit row, and
// nothing that destroys data without recording enough to put it back.

async function toolSetBudget(args: {
  month?: number;
  year?: number;
  amount?: number;
}): Promise<unknown> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return { error: "no database access" };
  const today = istDateString();
  const month = args.month ?? Number(today.slice(5, 7));
  const year = args.year ?? Number(today.slice(0, 4));
  if (month < 1 || month > 12) return { error: "month must be 1-12" };
  if (typeof args.amount !== "number" || args.amount < 0) return { error: "amount must be a number >= 0" };

  const { data: existing } = await supabase
    .from("budgets")
    .select("id,amount")
    .eq("user_id", userId)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();
  const before = existing as { id: string; amount: number } | null;

  const { data, error } = await supabase
    .from("budgets")
    .upsert({ user_id: userId, month, year, amount: args.amount } as never, {
      onConflict: "user_id,month,year",
    })
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  const id = (data as { id: string } | null)?.id || before?.id;
  if (id) {
    await logBotEdit("budgets", id, { amount: { old: before?.amount ?? null, new: args.amount } });
  }
  return {
    set: `${year}-${String(month).padStart(2, "0")}`,
    amount: args.amount,
    previous: before?.amount ?? null,
  };
}

async function toolLogPassport(args: {
  name?: string;
  purchase_date?: string;
  expiry_date?: string;
  amount_paid?: number;
  total_uses?: number;
  notes?: string;
}): Promise<unknown> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return { error: "no database access" };
  if (!args.name) return { error: "need a name for the passport" };
  if (typeof args.amount_paid !== "number" || args.amount_paid < 0) {
    return { error: "need amount_paid" };
  }
  if (typeof args.total_uses !== "number" || args.total_uses < 1) {
    return { error: "need total_uses (how many shows the passport covers)" };
  }
  const { data, error } = await supabase
    .from("passports")
    .insert({
      user_id: userId,
      name: args.name,
      purchase_date: args.purchase_date || istDateString(),
      expiry_date: args.expiry_date || null,
      amount_paid: args.amount_paid,
      total_uses: args.total_uses,
      notes: args.notes || null,
      is_active: true,
    } as never)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  return {
    added: args.name,
    amountPaid: args.amount_paid,
    totalUses: args.total_uses,
    id: (data as { id: string } | null)?.id,
    note: "Attaching it to individual movies is done in the app, not here.",
  };
}

async function toolAddCompanion(args: { name?: string; emoji?: string }): Promise<unknown> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return { error: "no database access" };
  if (!args.name) return { error: "need a name" };
  if (await resolveNamed("companions", args.name)) {
    return { error: `"${args.name}" is already a companion` };
  }
  const { error } = await supabase
    .from("companions")
    .insert({ user_id: userId, name: args.name, avatar_emoji: args.emoji || "🎬" } as never);
  return error ? { error: error.message } : { added: args.name, emoji: args.emoji || "🎬" };
}

async function toolRateTheater(args: {
  theater?: string;
  audi?: string;
  sound?: number;
  seat?: number;
  screen?: number;
  cleanliness?: number;
  notes?: string;
}): Promise<unknown> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return { error: "no database access" };
  if (!args.theater) return { error: "need a theater name" };
  const theater = await resolveNamed("theaters", args.theater);
  if (!theater) {
    return { error: `no theater matching "${args.theater}" — options are: ${(await namesIn("theaters")).join(", ")}` };
  }
  const scores = { sound: args.sound, seat: args.seat, screen: args.screen, cleanliness: args.cleanliness };
  for (const [field, value] of Object.entries(scores)) {
    if (value === undefined || value === null) continue;
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      return { error: `${field} must be a whole number 1-5` };
    }
  }
  if (Object.values(scores).every((v) => v === undefined || v === null) && !args.notes) {
    return { error: "give at least one score (sound, seat, screen, cleanliness) or a note" };
  }
  const { data, error } = await supabase
    .from("theater_ratings")
    .insert({
      user_id: userId,
      theater_id: theater.id,
      audi: args.audi || null,
      sound: args.sound ?? null,
      seat: args.seat ?? null,
      screen: args.screen ?? null,
      cleanliness: args.cleanliness ?? null,
      notes: args.notes || null,
    } as never)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  return { rated: theater.name, audi: args.audi || null, ...scores, id: (data as { id: string } | null)?.id };
}

async function findWatchlistItem(title: string): Promise<
  { id: string; title: string; priority: number } | null
> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return null;
  const { data } = await supabase
    .from("watchlist")
    .select("id,title,priority")
    .eq("user_id", userId)
    .is("watched_movie_id", null);
  const wanted = norm(title);
  return (
    ((data || []) as Array<{ id: string; title: string; priority: number }>).find(
      (w) => norm(w.title) === wanted || norm(w.title).includes(wanted) || wanted.includes(norm(w.title))
    ) || null
  );
}

async function toolSetWatchlistPriority(args: {
  title?: string;
  priority?: number;
}): Promise<unknown> {
  const supabase = serviceClient();
  if (!supabase) return { error: "no database access" };
  if (!args.title) return { error: "need a title" };
  if (![0, 1, 2].includes(args.priority as number)) {
    return { error: "priority must be 2 (high), 1 (normal) or 0 (low)" };
  }
  const item = await findWatchlistItem(args.title);
  if (!item) return { error: `"${args.title}" isn't on the watchlist` };
  const { error } = await supabase
    .from("watchlist")
    .update({ priority: args.priority } as never)
    .eq("id", item.id);
  if (error) return { error: error.message };
  await logBotEdit("watchlist", item.id, { priority: { old: item.priority, new: args.priority } });
  return { title: item.title, priority: args.priority, previous: item.priority };
}

async function toolRemoveFromWatchlist(args: { title?: string }): Promise<unknown> {
  const supabase = serviceClient();
  if (!supabase) return { error: "no database access" };
  if (!args.title) return { error: "need a title" };
  const item = await findWatchlistItem(args.title);
  if (!item) return { error: `"${args.title}" isn't on the watchlist` };

  // Keep the whole row in the audit entry, not just the id: this is the one
  // tool that removes a record, and undo_last_edit re-inserts what it finds
  // here. Deleting first and remembering afterwards would lose the row if the
  // audit write failed.
  const { data: row } = await supabase.from("watchlist").select("*").eq("id", item.id).maybeSingle();
  if (!row) return { error: "couldn't read that watchlist row" };
  await logBotEdit("watchlist", item.id, { __deleted__: { old: row, new: null } });
  const { error } = await supabase.from("watchlist").delete().eq("id", item.id);
  if (error) return { error: error.message };
  return { removed: item.title, note: "Say undo to put it back." };
}

const FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "get_recommendations",
    description:
      "Live PVR Lucknow data: personalized now-showing picks (predicted rating for the user, showtimes, prices, value scores, hall occupancy, booking links) and upcoming releases. Returns showtimes ONLY for one date (default today) — for 'tomorrow'/weekend questions you MUST pass date. For IMAX/4DX/3D/Dolby questions pass format so premium shows aren't ranked out.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Optional title filter" },
        date: {
          type: Type.STRING,
          description:
            "Show date YYYY-MM-DD. Omit for today. Compute from today's date for words like tomorrow/Saturday.",
        },
        format: {
          type: Type.STRING,
          description:
            "Filter shows to a format, substring match: IMAX, 4DX, 3D, 2D, EPIQ, Dolby. Omit for all formats.",
        },
        language: { type: Type.STRING, description: "Filter by language, e.g. Hindi, English. Omit for all." },
        time: {
          type: Type.STRING,
          description: "Time window HH:MM-HH:MM (24h), e.g. 18:00-24:00 for evening. Omit for all day.",
        },
      },
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
      properties: {
        year: { type: Type.NUMBER, description: "Calendar year, omit for all-time" },
        since: { type: Type.STRING, description: "Only movies on/after this date (YYYY-MM-DD)" },
        until: { type: Type.STRING, description: "Only movies on/before this date (YYYY-MM-DD)" },
      },
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
      "Edit a logged movie (matched by title). Editable: rating, review, remarks, fnb_cost, other_expenses, ticket_cost, convenience_fee, seat, audi, showtime (HH:MM), date (YYYY-MM-DD), language, director, booking_id, watched_with, is_rewatch, status, and by name: format, theater, mood, strongest_part, weakest_part, rewatch, franchise. Value score recomputes automatically. Every change is audit-logged and reversible via undo_last_edit. A name that matches nothing is an error listing the valid options — it is never silently ignored.",
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
        language: { type: Type.STRING },
        director: { type: Type.STRING },
        booking_id: { type: Type.STRING },
        watched_with: { type: Type.STRING, description: "Free-text note of who he watched it with" },
        is_rewatch: { type: Type.BOOLEAN },
        status: { type: Type.STRING, description: 'Either "watched" or "upcoming"' },
        format: { type: Type.STRING, description: "Format name, e.g. 2D, 3D, IMAX 2D, IMAX 3D, 4DX, Dolby Atmos" },
        theater: { type: Type.STRING, description: "Theater name to reassign the movie to" },
        mood: { type: Type.STRING, description: "Mood name from his own mood list" },
        strongest_part: { type: Type.STRING, description: "Aspect name, e.g. Direction, Score, Acting" },
        weakest_part: { type: Type.STRING, description: "Aspect name, e.g. Pacing, Writing" },
        rewatch: { type: Type.STRING, description: "Rewatch-likelihood option name from his own list" },
        franchise: { type: Type.STRING, description: "Franchise name to file the movie under" },
      },
      required: ["title"],
    },
  },
  {
    name: "get_watchlist",
    description:
      "The user's unwatched watchlist: titles, priority (2 high / 1 normal / 0 low), release dates, genres, runtime and notes.",
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

  {
    name: "get_passports",
    description:
      "PVR passports he has bought: cost, how many shows each covers, how many are used up, which movies used them, and whether the passport has paid for itself yet. Use this for any question about passports or passport savings.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_budgets",
    description:
      "Monthly cinema budgets against what was actually spent that month, with the remainder and whether he went over. A month with no budget row simply has no budget set.",
    parameters: {
      type: Type.OBJECT,
      properties: { year: { type: Type.NUMBER, description: "Restrict to one calendar year" } },
    },
  },
  {
    name: "get_companions",
    description:
      "The people he logs movies with: how many films together, when they last went, their average rating for those films, and total spend on them.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_fnb_breakdown",
    description:
      "Itemised food and drink: every purchase in the window plus per-item totals (quantity, spend, how often bought). Use this for 'what do I keep buying' or 'how much on popcorn' — get_stats only has the F&B total.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        since: { type: Type.STRING, description: "On/after this date (YYYY-MM-DD)" },
        until: { type: Type.STRING, description: "On/before this date (YYYY-MM-DD)" },
      },
    },
  },
  {
    name: "get_franchises",
    description:
      "Franchises he tracks and the movies filed under each, in release order, with average rating and spend per franchise.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_theater_ratings",
    description:
      "His own ratings of halls: sound, seat, screen and cleanliness (each 1-5) per theater and audi, with notes. Use this for 'which hall is best' questions.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "set_budget",
    description:
      "Set or change the cinema budget for a month. Defaults to the current month and year when they aren't given. Audit-logged and reversible via undo_last_edit.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        amount: { type: Type.NUMBER, description: "Budget in rupees" },
        month: { type: Type.NUMBER, description: "1-12, defaults to this month" },
        year: { type: Type.NUMBER, description: "Defaults to this year" },
      },
      required: ["amount"],
    },
  },
  {
    name: "log_passport",
    description:
      "Record a PVR passport he has bought. Attaching it to individual movies is done in the app, not here.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        amount_paid: { type: Type.NUMBER, description: "What he paid for it, in rupees" },
        total_uses: { type: Type.NUMBER, description: "How many shows it covers" },
        purchase_date: { type: Type.STRING, description: "YYYY-MM-DD, defaults to today" },
        expiry_date: { type: Type.STRING, description: "YYYY-MM-DD if it expires" },
        notes: { type: Type.STRING },
      },
      required: ["name", "amount_paid", "total_uses"],
    },
  },
  {
    name: "add_companion",
    description: "Add a person he watches movies with, so future logs can be attributed to them.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        emoji: { type: Type.STRING, description: "Avatar emoji, defaults to a clapperboard" },
      },
      required: ["name"],
    },
  },
  {
    name: "rate_theater",
    description:
      "Save his rating of a hall — sound, seat, screen, cleanliness, each a whole number 1-5, plus optional notes and the audi name. At least one score or a note is required.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        theater: { type: Type.STRING, description: "Theater name" },
        audi: { type: Type.STRING, description: "Audi/screen name, e.g. Audi 3" },
        sound: { type: Type.NUMBER },
        seat: { type: Type.NUMBER },
        screen: { type: Type.NUMBER },
        cleanliness: { type: Type.NUMBER },
        notes: { type: Type.STRING },
      },
      required: ["theater"],
    },
  },
  {
    name: "set_watchlist_priority",
    description:
      "Change how badly he wants to see something on the watchlist: 2 high, 1 normal, 0 low. Priority feeds the recommender, so this changes what gets recommended.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        priority: { type: Type.NUMBER, description: "2 = high, 1 = normal, 0 = low" },
      },
      required: ["title", "priority"],
    },
  },
  {
    name: "remove_from_watchlist",
    description:
      "Take a title off the watchlist. The removed row is kept in the audit trail, so undo_last_edit puts it back.",
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
  get_passports: toolPassports,
  get_budgets: toolBudgets,
  get_companions: toolCompanions,
  get_fnb_breakdown: toolFnbBreakdown,
  get_franchises: toolFranchises,
  get_theater_ratings: toolTheaterRatings,
  set_budget: toolSetBudget,
  log_passport: toolLogPassport,
  add_companion: toolAddCompanion,
  rate_theater: toolRateTheater,
  set_watchlist_priority: toolSetWatchlistPriority,
  remove_from_watchlist: toolRemoveFromWatchlist,
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
    "- Showtimes are per-date: get_recommendations returns shows ONLY for its showtimesDate. When he asks about tomorrow or any other day, call it with that date — presenting one day's showtimes as another day's is a critical failure. Say which date the times are for.",
    "- For format questions (IMAX/4DX/3D/Dolby) call get_recommendations with format set — the unfiltered ranking hides premium shows, so 'no IMAX in the results' without the filter proves nothing.",
    "WHAT YOU CAN READ: the full log row per movie (every cost, seat, audi, mood, companions, gift cards, occupancy) via get_recent_movies and get_movie_details; get_stats for totals plus breakdowns by month, theater, format, language, genre, mood and companion; and get_passports, get_budgets, get_companions, get_fnb_breakdown (itemised food, not just a total), get_franchises, get_theater_ratings. If a question touches one of those, call its tool — do not answer it as though the data were unavailable.",
    "LOGGING & EDITING: log_movie logs a watched movie from conversation with every detail he gives (date, costs, gift card usage, rating, review) — you CAN log movies, never claim otherwise. update_movie edits costs, seat, showtime, date, review/remarks, and by name the format, theater, mood, strongest/weakest part, rewatch option and franchise. update_gift_card fixes amount_paid or expiry; rate_movie is a rating shortcut; add_to_watchlist, set_watchlist_priority (2 high / 1 normal / 0 low) and remove_from_watchlist manage the watchlist; set_budget sets a month's budget; log_passport records a passport; add_companion adds someone he watches with; rate_theater saves a hall rating. All writes are audit-logged; undo_last_edit reverts the latest one when he says undo/revert, including putting back a removed watchlist row.",
    "WRITES ARE HIS DECISION, NOT YOURS: only write when he asked for it in this turn. Never set a budget, change a priority, remove a watchlist item or edit a movie because it seems like a good idea. Reading is always fine.",
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
          // Every model in MODELS is a 3.x, which all take thinkingLevel;
          // a 2.x entry would reject it and need a guard here again.
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
        contents,
      });
    } catch (error) {
      const status = (error as { status?: number })?.status;
      // 429 = that model's daily free-tier quota is gone. 503 = the model is
      // overloaded, which is routine on a just-released model: gemini-3.7-flash
      // answered 503 "experiencing high demand" on 2 of 3 calls the day it was
      // added here. Both mean "this model can't serve the turn", so both step
      // down the chain rather than failing the whole message.
      const recoverable = status === 429 || status === 503 || status === 500;
      if (recoverable && modelIndex < MODELS.length - 1) {
        // Switch model and restart the conversation turn cleanly — thought
        // signatures don't transfer between models.
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
      if (recoverable) {
        return "Every Gemini model is busy or rate-limited right now — try again in a minute. The buttons and /tonight, /gc, /recap still work.";
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
