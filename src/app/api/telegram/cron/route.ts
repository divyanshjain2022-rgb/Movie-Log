import { NextRequest, NextResponse } from "next/server";
import {
  esc,
  getBotState,
  istDateString,
  istMinutesOfDay,
  istWeekday,
  minutesFromTime,
  notify,
  resolveBotUserId,
  serviceClient,
  setBotState,
  SITE_URL,
} from "@/lib/telegram";
import { fetchPvrSearchMovies } from "@/lib/pvr/client";
import { titleMatches } from "@/lib/pvr/personal-predictor";
import { formatCurrency } from "@/lib/formula";

export const maxDuration = 60;

interface MovieForCron {
  id: string;
  title: string;
  date: string;
  showtime: string | null;
  audi: string | null;
  rating: number | null;
  runtime_minutes: number | null;
  occupancy: number | null;
  seat_map: unknown;
  total_cost: number;
  theater: { name: string; city: string | null } | null;
  format: { name: string } | null;
  movie_gift_cards: Array<{
    amount_used: number;
    gift_card: { discount_percent: number | null } | null;
  }> | null;
}

async function todaysMovies(userId: string): Promise<MovieForCron[]> {
  const supabase = serviceClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("movies")
    .select(
      "id,title,date,showtime,audi,rating,runtime_minutes,occupancy,seat_map,total_cost,theater:theaters(name,city),format:formats(name),movie_gift_cards(amount_used,gift_card:gift_cards(discount_percent))"
    )
    .eq("user_id", userId)
    .eq("date", istDateString());
  return (data || []) as unknown as MovieForCron[];
}

// 1. Auto-capture hall occupancy at two staged points around each logged
// show: ~10 minutes before start and ~25 minutes in (final numbers). A third
// capture happens at log time in the webhook. Each successful capture
// OVERWRITES (later = closer to the real turnout); failures never clear
// existing data, so the movie keeps the best snapshot it ever got.
async function occupancyTask(userId: string): Promise<string> {
  const nowMinutes = istMinutesOfDay();
  const movies = await todaysMovies(userId);
  const supabase = serviceClient();
  if (!supabase) return "no client";
  let captured = 0;

  for (const movie of movies) {
    if (!movie.showtime) continue;
    const showMinutes = minutesFromTime(movie.showtime);
    if (showMinutes === null) continue;
    const delta = showMinutes - nowMinutes;

    // Cron ticks every ~15 min; these windows land one attempt per stage.
    const stage = delta >= 0 && delta <= 15 ? "pre" : delta <= -20 && delta >= -35 ? "post" : null;
    if (!stage) continue;

    const stateKey = `occ2:${movie.id}`;
    const state = (await getBotState<{ pre?: boolean; post?: boolean }>(stateKey)) || {};
    if (state[stage]) continue;
    await setBotState(stateKey, { ...state, [stage]: true });

    const response = await fetch(`${SITE_URL}/api/pvr/occupancy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        city: movie.theater?.city || "Lucknow",
        title: movie.title,
        theaterName: movie.theater?.name || null,
        date: movie.date,
        showtime: movie.showtime,
        format: movie.format?.name || null,
        audi: movie.audi || null,
      }),
    });
    const payload = await response.json().catch(() => null);

    if (payload?.found) {
      await supabase
        .from("movies")
        .update({ occupancy: payload.occupancy, seat_map: payload.seatMap } as never)
        .eq("id", movie.id);
      captured += 1;
      const label = stage === "pre" ? "10 min before showtime" : "25 min into the show";
      await notify(
        `📸 <b>${esc(movie.title)}</b> hall snapshot (${label}): ${payload.occupancy}% full.`
      );
    } else if (stage === "post" && movie.occupancy) {
      // Seat map already closed — keep the earlier snapshot silently.
    } else if (stage === "post") {
      await notify(
        `📸 Couldn't capture <b>${esc(movie.title)}</b> — PVR closed the seat map and no earlier snapshot exists.`
      );
    }
  }
  return `captured ${captured}`;
}

// 2. Ask for a rating once the credits have rolled.
async function ratingPromptTask(userId: string): Promise<string> {
  const nowMinutes = istMinutesOfDay();
  const movies = await todaysMovies(userId);
  let prompted = 0;

  for (const movie of movies) {
    if (movie.rating || !movie.showtime) continue;
    const showMinutes = minutesFromTime(movie.showtime);
    if (showMinutes === null) continue;
    const endMinutes = showMinutes + (movie.runtime_minutes || 150) + 20;
    if (nowMinutes < endMinutes || nowMinutes - endMinutes > 360) continue;
    const stateKey = `prompt:${movie.id}`;
    if (await getBotState(stateKey)) continue;
    await setBotState(stateKey, { at: new Date().toISOString() });

    const row1 = [6, 6.5, 7, 7.5, 8].map((n) => ({ text: String(n), callback_data: `rate:${movie.id}:${n}` }));
    const row2 = [8.5, 9, 9.5, 10].map((n) => ({ text: String(n), callback_data: `rate:${movie.id}:${n}` }));
    const row3 = [3, 4, 5, 5.5].map((n) => ({ text: String(n), callback_data: `rate:${movie.id}:${n}` }));
    await notify(`🍿 How was <b>${esc(movie.title)}</b>?`, {
      reply_markup: { inline_keyboard: [row1, row2, row3] },
    });
    prompted += 1;
  }
  return `prompted ${prompted}`;
}

// 3. Watchlist titles that just became bookable at PVR.
async function radarTask(userId: string): Promise<string> {
  const supabase = serviceClient();
  if (!supabase) return "no client";
  const { data } = await supabase
    .from("watchlist")
    .select("title")
    .eq("user_id", userId)
    .is("watched_movie_id", null);
  const watchlist = ((data || []) as Array<{ title: string }>).map((w) => w.title);
  if (watchlist.length === 0) return "empty watchlist";

  const nowShowing = await fetchPvrSearchMovies({ city: "Lucknow" });
  const known = (await getBotState<{ ids: string[] }>("radar_known"))?.ids || [];
  const knownSet = new Set(known);
  const fresh: string[] = [];

  for (const movie of nowShowing.data) {
    if (knownSet.has(movie.id)) continue;
    const match = watchlist.find((title) => titleMatches(movie.title, title));
    if (match) {
      fresh.push(movie.id);
      await notify(
        `🚨 <b>${esc(movie.title)}</b> from your watchlist is now bookable at PVR Lucknow!\n<a href="${movie.redirectUrl}">Open on PVR</a>`
      );
    }
  }
  // Remember everything currently listed so each id is evaluated once.
  await setBotState("radar_known", { ids: nowShowing.data.map((m) => m.id).slice(0, 300) });
  return `alerted ${fresh.length}`;
}

// 4. Daily gift-card check (first run after 09:30 IST).
async function giftCardTask(userId: string): Promise<string> {
  if (istMinutesOfDay() < 570) return "before window";
  const stateKey = "gc_daily";
  const last = await getBotState<{ date: string }>(stateKey);
  if (last?.date === istDateString()) return "already ran";
  await setBotState(stateKey, { date: istDateString() });

  const supabase = serviceClient();
  if (!supabase) return "no client";
  const { data } = await supabase
    .from("gift_cards")
    .select("face_value,expiry_date,platform:platforms(name),movie_gift_cards(amount_used)")
    .eq("user_id", userId);
  const cards = ((data || []) as unknown as Array<{
    face_value: number;
    expiry_date: string;
    platform: { name: string } | null;
    movie_gift_cards: Array<{ amount_used: number }> | null;
  }>)
    .map((card) => ({
      ...card,
      remaining: Math.max(
        card.face_value - (card.movie_gift_cards || []).reduce((sum, u) => sum + u.amount_used, 0),
        0
      ),
    }))
    .filter((card) => card.remaining > 0.5);

  const today = Date.now();
  const expiring = cards.filter((card) => {
    const days = Math.ceil((new Date(card.expiry_date).getTime() - today) / 86_400_000);
    return days > 0 && days <= 14;
  });
  for (const card of expiring) {
    const days = Math.ceil((new Date(card.expiry_date).getTime() - today) / 86_400_000);
    await notify(
      `⏳ Gift card <b>${formatCurrency(card.remaining)}</b> ${esc(card.platform?.name || "")} expires in <b>${days} ${days === 1 ? "day" : "days"}</b>. Book something!`
    );
  }

  const total = cards.reduce((sum, card) => sum + card.remaining, 0);
  const lowKey = "gc_low_nudge";
  const lastLow = await getBotState<{ week: string }>(lowKey);
  const week = `${istDateString().slice(0, 7)}-w${Math.ceil(Number(istDateString().slice(8)) / 7)}`;
  if (total < 400 && lastLow?.week !== week) {
    await setBotState(lowKey, { week });
    await notify(
      `💳 Gift card balance is down to <b>${formatCurrency(total)}</b> — grab a fresh card in the next sale.`
    );
  }
  return `expiring ${expiring.length}, total ${Math.round(total)}`;
}

// 5. Thursday releases digest (first run after 17:00 IST on Thursday).
async function digestTask(): Promise<string> {
  if (istWeekday() !== "Thu" || istMinutesOfDay() < 1020) return "not the window";
  const stateKey = "digest_thu";
  const last = await getBotState<{ date: string }>(stateKey);
  if (last?.date === istDateString()) return "already ran";
  await setBotState(stateKey, { date: istDateString() });

  const secret = process.env.CRON_SECRET;
  const response = await fetch(`${SITE_URL}/api/pvr/recommendations?city=Lucknow`, {
    headers: secret ? { "x-bot-secret": secret } : undefined,
  });
  if (!response.ok) return `recs ${response.status}`;
  const payload = (await response.json()) as {
    upcoming: Array<{ title: string; releaseDate: string | null; onWatchlist?: boolean }>;
  };
  const soon = (payload.upcoming || []).filter((movie) => {
    if (!movie.releaseDate) return false;
    const days = (new Date(movie.releaseDate).getTime() - Date.now()) / 86_400_000;
    return days >= -1 && days <= 4;
  });
  if (soon.length === 0) return "nothing releasing";
  const lines = soon
    .slice(0, 10)
    .map((movie) => `• ${movie.onWatchlist ? "⭐ " : ""}${esc(movie.title)} — ${esc(movie.releaseDate || "")}`);
  await notify(["🎬 <b>Releasing this weekend</b>", "", ...lines].join("\n"));
  return `digest ${soon.length}`;
}

// 6. Sunday recap (first run after 20:00 IST on Sunday).
async function recapTask(userId: string): Promise<string> {
  if (istWeekday() !== "Sun" || istMinutesOfDay() < 1200) return "not the window";
  const stateKey = "recap_sun";
  const last = await getBotState<{ date: string }>(stateKey);
  if (last?.date === istDateString()) return "already ran";
  await setBotState(stateKey, { date: istDateString() });

  const supabase = serviceClient();
  if (!supabase) return "no client";
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("movies")
    .select("title,rating,total_cost,movie_gift_cards(amount_used,gift_card:gift_cards(discount_percent))")
    .eq("user_id", userId)
    .gte("date", since);
  const rows = (data || []) as unknown as Array<{
    title: string;
    rating: number | null;
    total_cost: number;
    movie_gift_cards: Array<{ amount_used: number; gift_card: { discount_percent: number | null } | null }> | null;
  }>;
  if (rows.length === 0) {
    await notify("🗓 Zero movies this week. The projectors are lonely.");
    return "empty week";
  }
  const spend = rows.reduce((sum, m) => sum + m.total_cost, 0);
  const saved = rows.reduce(
    (sum, m) =>
      sum +
      (m.movie_gift_cards || []).reduce(
        (x, g) => x + g.amount_used * ((g.gift_card?.discount_percent || 0) / 100),
        0
      ),
    0
  );
  const best = [...rows].sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
  await notify(
    [
      `🗓 <b>Week in cinema</b> — ${rows.length} ${rows.length === 1 ? "movie" : "movies"}, ${formatCurrency(spend)} spent, ${formatCurrency(saved)} saved`,
      best?.rating ? `Best: ${esc(best.title)} (${best.rating}/10)` : "",
    ]
      .filter(Boolean)
      .join("\n")
  );
  return "sent";
}

// 7. Warm the durable PVR cache during waking hours so the recommendations
// page and bot showtime queries read from Supabase (pvr_cache) instead of
// scraping PVR cold. quotes=skip keeps the warm sweep off the live
// seat-layout endpoints. Also trims cache rows past their stale window.
async function warmPvrTask(): Promise<string> {
  if (istMinutesOfDay() < 7 * 60 + 30) return "night — skipped";
  const secret = process.env.CRON_SECRET;
  const response = await fetch(
    `${SITE_URL}/api/pvr/recommendations?city=Lucknow&quotes=skip`,
    { headers: secret ? { "x-bot-secret": secret } : undefined }
  );
  if (!response.ok) return `warm fetch failed (${response.status})`;
  const payload = (await response.json()) as { recommendations?: unknown[] };

  const supabase = serviceClient();
  if (supabase) {
    await supabase
      .from("pvr_cache")
      .delete()
      .lt("stale_until", new Date(Date.now() - 86_400_000).toISOString());
  }
  return `warmed ${payload.recommendations?.length ?? 0} recs`;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided =
    request.nextUrl.searchParams.get("secret") ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await resolveBotUserId();
  if (!userId) {
    return NextResponse.json({ error: "No user resolvable (missing service key or empty movies table)" }, { status: 500 });
  }

  const results: Record<string, string> = {};
  const tasks: Array<[string, () => Promise<string>]> = [
    ["occupancy", () => occupancyTask(userId)],
    ["ratingPrompt", () => ratingPromptTask(userId)],
    ["radar", () => radarTask(userId)],
    ["giftCards", () => giftCardTask(userId)],
    ["digest", () => digestTask()],
    ["recap", () => recapTask(userId)],
    ["warmPvr", () => warmPvrTask()],
  ];
  for (const [name, task] of tasks) {
    try {
      results[name] = await task();
    } catch (error) {
      results[name] = `error: ${error instanceof Error ? error.message : "unknown"}`;
    }
  }
  return NextResponse.json({ ok: true, at: new Date().toISOString(), results });
}
