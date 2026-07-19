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
const MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-2.5-flash"];
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

// Shared by the inline rating buttons and the conversational rate_movie tool.
export async function applyRating(
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

async function toolRecentMovies(args: { limit?: number; since?: string }): Promise<unknown> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return { error: "no database access" };
  let query = supabase
    .from("movies")
    .select("title,date,rating,value_score,total_cost,showtime,occupancy,theater:theaters(name),format:formats(name)")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(Math.min(args.limit || 10, 30));
  if (args.since) query = query.gte("date", args.since);
  const { data } = await query;
  return data || [];
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
        limit: { type: Type.NUMBER, description: "Max rows (default 10, max 30)" },
        since: { type: Type.STRING, description: "Only movies on/after this date (YYYY-MM-DD)" },
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

  const systemInstruction = [
    "You are CinemaLog, Divyansh's personal cinema assistant on Telegram.",
    `Today is ${istDateString()} (IST). He watches movies at PVR/INOX in Lucknow and pays with discounted gift cards.`,
    "Use the tools for anything about his log, spending, gift cards, what's playing, or ratings — never invent data.",
    "Actions: rate_movie saves a rating; add_to_watchlist saves a title. Confirm what you did.",
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
