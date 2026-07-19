import { NextRequest, NextResponse } from "next/server";
import {
  allowedChatId,
  esc,
  getBotState,
  getTelegramFileBase64,
  resolveBotUserId,
  sendMessage,
  serviceClient,
  setBotState,
  SITE_URL,
  tg,
} from "@/lib/telegram";
import { GoogleGenAI } from "@google/genai";
import { applyRating, converse } from "@/lib/telegram-ai";
import { formatCurrency, getValueTier, DEFAULT_FORMULA_PARAMS } from "@/lib/formula";
import type { FormulaParams } from "@/types";

export const maxDuration = 60;

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenOverlap(a: string, b: string): number {
  const at = new Set(norm(a).split(" ").filter(Boolean));
  const bt = norm(b).split(" ").filter(Boolean);
  if (at.size === 0 || bt.length === 0) return 0;
  return bt.filter((t) => at.has(t)).length / Math.max(at.size, bt.length);
}

interface OcrTicket {
  movie_title: string | null;
  date: string | null;
  showtime: string | null;
  theater: string | null;
  audi: string | null;
  format: string | null;
  seat: string | null;
  ticket_cost: number | null;
  convenience_fee: number | null;
  booking_id: string | null;
}

async function activeFormulaParams(): Promise<FormulaParams> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return DEFAULT_FORMULA_PARAMS;
  const { data } = await supabase
    .from("formula_configs")
    .select("params")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  return ((data as { params?: FormulaParams } | null)?.params as FormulaParams) || DEFAULT_FORMULA_PARAMS;
}

// ---- Image classification: ticket, gift card, or just a photo? ----

async function classifyImage(base64: string, mime: string): Promise<"ticket" | "gift_card" | "other"> {
  const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey) return "ticket";
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT" as const,
          properties: {
            kind: {
              type: "STRING" as const,
              description: "ticket | gift_card | other",
            },
          },
        },
      },
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: mime, data: base64 } },
            {
              text: "Classify this image. 'ticket' = movie ticket, booking confirmation, or an SMS/WhatsApp/app screenshot of a cinema booking. 'gift_card' = gift card or voucher. 'other' = anything else (photos of people, food, cinema halls, posters, random images).",
            },
          ],
        },
      ],
    });
    const parsed = JSON.parse(response.text || "{}") as { kind?: string };
    if (parsed.kind === "gift_card" || parsed.kind === "other") return parsed.kind;
    return "ticket";
  } catch {
    return "ticket";
  }
}

interface PendingImage {
  fileId: string;
  mode: "choose" | "await_title";
}

async function offerImageChoices(chatId: string, fileId: string): Promise<void> {
  await setBotState("pending_image", { fileId, mode: "choose" } satisfies PendingImage);
  await sendMessage(chatId, "This doesn't look like a ticket. What should I do with it?", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🎟 Log as ticket", callback_data: "img:ticket" },
          { text: "💳 Gift card", callback_data: "img:gc" },
        ],
        [
          { text: "📎 Attach to a movie", callback_data: "img:attach" },
          { text: "✖️ Ignore", callback_data: "img:ignore" },
        ],
      ],
    },
  });
}

async function attachPhotoToMovie(chatId: string, fileId: string, title: string): Promise<void> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return;
  const { data } = await supabase
    .from("movies")
    .select("id,title,date")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(80);
  const wanted = norm(title);
  const match = ((data || []) as Array<{ id: string; title: string }>).find(
    (m) => norm(m.title) === wanted || norm(m.title).includes(wanted) || wanted.includes(norm(m.title))
  );
  if (!match) {
    await sendMessage(chatId, `No logged movie matching “${esc(title)}” — try again with the exact title.`);
    return;
  }
  const file = await getTelegramFileBase64(fileId);
  if (!file) {
    await sendMessage(chatId, "Couldn't re-download that photo from Telegram, send it again.");
    await setBotState("pending_image", null);
    return;
  }
  const ext = file.mime === "image/png" ? "png" : "jpg";
  const path = `${userId}/${match.id}/${Date.now()}.${ext}`;
  const bytes = Buffer.from(file.base64, "base64");
  const { error: uploadError } = await supabase.storage
    .from("movie-photos")
    .upload(path, bytes, { contentType: file.mime });
  if (uploadError) {
    await sendMessage(chatId, `Upload failed: ${esc(uploadError.message)}`);
    return;
  }
  await supabase.from("movie_photos").insert({
    user_id: userId,
    movie_id: match.id,
    storage_path: path,
    photo_type: "general",
    caption: "via Telegram",
  } as never);
  await setBotState("pending_image", null);
  await sendMessage(chatId, `📎 Photo attached to <b>${esc(match.title)}</b>.`);
}

// ---- Ticket photo -> OCR -> logged movie ----

async function handleTicketPhoto(chatId: string, fileId: string): Promise<void> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) {
    await sendMessage(chatId, "Server missing SUPABASE_SERVICE_ROLE_KEY — can't write to the log yet.");
    return;
  }

  const file = await getTelegramFileBase64(fileId);
  if (!file) {
    await sendMessage(chatId, "Couldn't download that file from Telegram, try again.");
    return;
  }

  await sendMessage(chatId, "Reading the ticket…");
  const ocrResponse = await fetch(`${SITE_URL}/api/ocr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: file.base64, mimeType: file.mime }),
  });
  const ticket = (await ocrResponse.json()) as OcrTicket & { error?: string };
  if (!ocrResponse.ok || ticket.error || !ticket.movie_title) {
    await sendMessage(chatId, `OCR failed: ${esc(ticket.error || "no title found")}`);
    return;
  }

  // Match theater + format against the user's own tables.
  const [{ data: theaters }, { data: formats }] = await Promise.all([
    supabase.from("theaters").select("id,name").eq("user_id", userId),
    supabase.from("formats").select("id,name,weight").eq("user_id", userId),
  ]);
  const theaterRows = (theaters || []) as unknown as Array<{ id: string; name: string }>;
  const formatRows = (formats || []) as unknown as Array<{ id: string; name: string; weight: number | null }>;

  const theater = ticket.theater
    ? theaterRows
        .map((t) => ({ t, score: tokenOverlap(ticket.theater!, t.name) }))
        .sort((a, b) => b.score - a.score)
        .find((x) => x.score >= 0.4)?.t || null
    : null;

  const ocrFormat = norm(ticket.format || "2d");
  const format = formatRows
    .map((f) => {
      const ftokens = norm(f.name).split(" ").filter(Boolean);
      const hit = ftokens.every((t) => ocrFormat.includes(t));
      return { f, score: hit ? ftokens.length : 0 };
    })
    .sort((a, b) => b.score - a.score)
    .find((x) => x.score > 0)?.f || formatRows.find((f) => norm(f.name) === "2d") || null;

  // Enrich from TMDB the same way the app's new-movie flow does: poster,
  // runtime, genres, director, cast, ratings, trailer.
  let tmdbFields: Record<string, unknown> = {};
  try {
    const searchResponse = await fetch(
      `${SITE_URL}/api/tmdb?query=${encodeURIComponent(ticket.movie_title)}`
    );
    const search = (await searchResponse.json()) as {
      results?: Array<{ tmdb_id: number }>;
    };
    const first = search.results?.[0];
    if (first?.tmdb_id) {
      const detailResponse = await fetch(`${SITE_URL}/api/tmdb?id=${first.tmdb_id}`);
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
          cast_members:
            Array.isArray(d.cast_members) && d.cast_members.length > 0 ? d.cast_members : null,
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
    // Enrichment is best-effort; the log entry works without it.
  }

  const row = {
    user_id: userId,
    title: ticket.movie_title,
    date: ticket.date || new Date().toISOString().slice(0, 10),
    showtime: ticket.showtime || null,
    theater_id: theater?.id || null,
    audi: ticket.audi || null,
    format_id: format?.id || null,
    seat: ticket.seat || null,
    ticket_cost: ticket.ticket_cost || 0,
    convenience_fee: ticket.convenience_fee || 0,
    booking_id: ticket.booking_id || null,
    status: "watched",
    ...tmdbFields,
  };

  const { data: created, error } = await supabase
    .from("movies")
    .insert(row as never)
    .select("id")
    .single();
  if (error || !created) {
    await sendMessage(chatId, `Couldn't save the movie: ${esc(error?.message || "unknown error")}`);
    return;
  }
  const movieId = (created as { id: string }).id;

  const missing: string[] = [];
  if (!ticket.ticket_cost) missing.push("ticket price");
  if (!ticket.date) missing.push("date");
  if (!ticket.showtime) missing.push("showtime");

  const lines = [
    `🎬 <b>${esc(ticket.movie_title)}</b> logged${tmdbFields.poster_url ? " (TMDB matched)" : ""}`,
    `${esc(ticket.date || "?")} · ${esc(ticket.showtime || "?")} · ${esc(theater?.name || ticket.theater || "unknown theater")}`,
    `${esc(format?.name || ticket.format || "2D")} · Audi ${esc(ticket.audi || "?")} · Seat ${esc(ticket.seat || "?")}`,
    `Ticket ${formatCurrency(ticket.ticket_cost || 0)} + fee ${formatCurrency(ticket.convenience_fee || 0)}`,
  ];
  if (missing.length > 0) {
    lines.push(
      "",
      `⚠️ I couldn't read the ${missing.join(", ")} — just tell me (e.g. "ticket was 250, popcorn 300") and I'll fill it in.`
    );
  }
  lines.push("", "How was it?");
  await sendMessage(chatId, lines.join("\n"), {
    reply_markup: ratingKeyboard(movieId),
  });

  // Seed the conversation history so a plain-text follow-up ("paid 250, had
  // fries for 180") resolves to update_movie on this title.
  try {
    const history =
      (await getBotState<Array<{ role: "user" | "model"; text: string }>>("chat_history")) || [];
    history.push({
      role: "model",
      text: `(Just logged "${ticket.movie_title}" (${ticket.date || "today"}) from a ticket photo.${
        missing.length > 0
          ? ` Missing: ${missing.join(", ")}. If the user provides costs or details next, call update_movie for "${ticket.movie_title}".`
          : ""
      })`,
    });
    await setBotState("chat_history", history.slice(-16));
  } catch {
    // Context seeding is best-effort.
  }
}

function ratingKeyboard(movieId: string) {
  const row1 = [6, 6.5, 7, 7.5, 8].map((n) => ({
    text: String(n),
    callback_data: `rate:${movieId}:${n}`,
  }));
  const row2 = [8.5, 9, 9.5, 10].map((n) => ({
    text: String(n),
    callback_data: `rate:${movieId}:${n}`,
  }));
  const row3 = [3, 4, 5, 5.5].map((n) => ({
    text: String(n),
    callback_data: `rate:${movieId}:${n}`,
  }));
  return { inline_keyboard: [row1, row2, row3] };
}

// ---- Gift-card photo (caption "gc") ----

async function handleGiftCardPhoto(chatId: string, fileId: string): Promise<void> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) {
    await sendMessage(chatId, "Server missing SUPABASE_SERVICE_ROLE_KEY — can't write yet.");
    return;
  }
  const file = await getTelegramFileBase64(fileId);
  if (!file) {
    await sendMessage(chatId, "Couldn't download that file, try again.");
    return;
  }

  await sendMessage(chatId, "Reading the gift card…");
  const response = await fetch(`${SITE_URL}/api/ocr/gift-card`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: file.base64, mimeType: file.mime }),
  });
  const card = (await response.json()) as {
    card_number: string | null;
    pin: string | null;
    face_value: number | null;
    expiry_date: string | null;
    platform: string | null;
    error?: string;
  };
  if (!response.ok || card.error || !card.face_value) {
    await sendMessage(chatId, `Gift card OCR failed: ${esc(card.error || "no face value found")}`);
    return;
  }

  const { data: platforms } = await supabase
    .from("platforms")
    .select("id,name")
    .eq("user_id", userId);
  const platform = ((platforms || []) as unknown as Array<{ id: string; name: string }>)
    .map((p) => ({ p, score: tokenOverlap(card.platform || "", p.name) }))
    .sort((a, b) => b.score - a.score)
    .find((x) => x.score >= 0.5)?.p;

  const row = {
    user_id: userId,
    face_value: card.face_value,
    // Purchase price isn't on the card image — assume face value, edit in-app.
    amount_paid: card.face_value,
    purchase_date: new Date().toISOString().slice(0, 10),
    expiry_date:
      card.expiry_date ||
      new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
    code: [card.card_number, card.pin ? `PIN ${card.pin}` : null].filter(Boolean).join(" · ") || null,
    platform_id: platform?.id || null,
  };
  const { error } = await supabase.from("gift_cards").insert(row as never);
  if (error) {
    await sendMessage(chatId, `Couldn't save the card: ${esc(error.message)}`);
    return;
  }
  await sendMessage(
    chatId,
    `💳 Gift card saved: <b>${formatCurrency(card.face_value)}</b> ${esc(platform?.name || card.platform || "")}\n` +
      `Expiry ${esc(row.expiry_date)} · amount paid assumed = face value (fix in the app if you got a discount).`
  );
}

// ---- /gc ----

async function handleGcCommand(chatId: string): Promise<void> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) {
    await sendMessage(chatId, "Server missing SUPABASE_SERVICE_ROLE_KEY.");
    return;
  }
  const { data } = await supabase
    .from("gift_cards")
    .select("id,face_value,amount_paid,discount_percent,expiry_date,code,platform:platforms(name),movie_gift_cards(amount_used)")
    .eq("user_id", userId)
    .order("expiry_date", { ascending: true });
  const cards = ((data || []) as unknown as Array<{
    id: string;
    face_value: number;
    discount_percent: number | null;
    expiry_date: string;
    code: string | null;
    platform: { name: string } | null;
    movie_gift_cards: Array<{ amount_used: number }> | null;
  }>)
    .map((card) => {
      const used = (card.movie_gift_cards || []).reduce((sum, usage) => sum + usage.amount_used, 0);
      return { ...card, remaining: Math.max(card.face_value - used, 0) };
    })
    .filter((card) => card.remaining > 0.5);

  if (cards.length === 0) {
    await sendMessage(chatId, "No gift cards with balance left. Time to stock up during the next sale.");
    return;
  }

  const today = new Date();
  const lines = cards.map((card) => {
    const days = Math.ceil((new Date(card.expiry_date).getTime() - today.getTime()) / 86_400_000);
    const expiry = days <= 0 ? "⚠️ EXPIRED" : days <= 14 ? `⚠️ ${days}d left` : `exp ${card.expiry_date}`;
    return `• <b>${formatCurrency(card.remaining)}</b> ${esc(card.platform?.name || "GC")} · ${Math.round(card.discount_percent || 0)}% off · ${expiry}`;
  });
  const best = cards[0];
  const total = cards.reduce((sum, card) => sum + card.remaining, 0);
  lines.push("", `Total balance <b>${formatCurrency(total)}</b>`);
  lines.push(
    `Use next: <b>${esc(best.platform?.name || "GC")} ${formatCurrency(best.remaining)}</b> (expires first)`
  );
  await sendMessage(chatId, ["💳 <b>Gift cards</b>", "", ...lines].join("\n"));
}

// ---- /tonight + free-text movie lookup ----

interface RecPayload {
  recommendations: Array<{
    movie: { title: string; redirectUrl?: string };
    predictedRating: number;
    bestOption: {
      show: { showTime: string; cinemaName: string; redirectUrl: string };
      displayPrice: number | null;
      valueScore: number;
      occupancyPercent: number | null;
    };
  }>;
}

async function handleTonight(chatId: string, query?: string): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    await sendMessage(chatId, "CRON_SECRET isn't configured yet.");
    return;
  }
  await sendMessage(chatId, query ? `Looking up “${esc(query)}”…` : "Checking what's worth watching…");
  const params = new URLSearchParams({ city: "Lucknow" });
  if (query) params.set("text", query);
  const response = await fetch(`${SITE_URL}/api/pvr/recommendations?${params}`, {
    headers: { "x-bot-secret": secret },
  });
  if (!response.ok) {
    await sendMessage(chatId, `Recommendations unavailable right now (HTTP ${response.status}).`);
    return;
  }
  const payload = (await response.json()) as RecPayload;
  const recs = (payload.recommendations || []).slice(0, query ? 1 : 3);
  if (recs.length === 0) {
    await sendMessage(
      chatId,
      query ? `“${esc(query)}” isn't playing at PVR Lucknow right now.` : "Nothing bookable found right now."
    );
    return;
  }
  const params2 = await activeFormulaParams();
  const blocks = recs.map((rec, index) => {
    const option = rec.bestOption;
    const price = option.displayPrice ? formatCurrency(option.displayPrice) : "price pending";
    const tier = option.valueScore > 0 ? ` (${getValueTier(option.valueScore, params2).label})` : "";
    const occ = option.occupancyPercent !== null ? ` · hall ${option.occupancyPercent}% full` : "";
    return [
      `${index + 1}. <b>${esc(rec.movie.title)}</b> — predicted ${rec.predictedRating.toFixed(1)}★`,
      `   ${esc(option.show.showTime)} · ${esc(option.show.cinemaName)}`,
      `   ${price}${tier}${occ}`,
      `   <a href="${option.show.redirectUrl}">Book on PVR</a>`,
    ].join("\n");
  });
  await sendMessage(chatId, [query ? "🎯 Best match" : "🍿 <b>Tonight's picks</b>", "", ...blocks].join("\n\n"));
}

// ---- /recap ----

async function handleRecap(chatId: string): Promise<void> {
  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) return;
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("movies")
    .select("title,rating,total_cost,date,movie_gift_cards(amount_used,gift_card:gift_cards(discount_percent))")
    .eq("user_id", userId)
    .gte("date", since)
    .order("date", { ascending: true });
  const rows = (data || []) as unknown as Array<{
    title: string;
    rating: number | null;
    total_cost: number;
    date: string;
    movie_gift_cards: Array<{ amount_used: number; gift_card: { discount_percent: number | null } | null }> | null;
  }>;
  if (rows.length === 0) {
    await sendMessage(chatId, "No movies in the last 7 days. The screens miss you.");
    return;
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
  const lines = rows.map(
    (m) => `• ${esc(m.title)} — ${m.rating ? `${m.rating}/10` : "unrated"} · ${formatCurrency(m.total_cost)}`
  );
  await sendMessage(
    chatId,
    [
      `🗓 <b>Last 7 days</b> — ${rows.length} ${rows.length === 1 ? "movie" : "movies"}`,
      "",
      ...lines,
      "",
      `Spent ${formatCurrency(spend)} · saved ${formatCurrency(saved)} via gift cards`,
    ].join("\n")
  );
}

// ---- Rating callback ----

async function handleRatingCallback(
  callbackId: string,
  chatId: string,
  messageId: number,
  movieId: string,
  rating: number
): Promise<void> {
  const result = await applyRating(movieId, rating);
  if (!result) {
    await tg("answerCallbackQuery", { callback_query_id: callbackId, text: "Movie not found" });
    return;
  }
  await tg("answerCallbackQuery", { callback_query_id: callbackId, text: `Rated ${rating}/10` });
  await tg("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] },
  });
  const tierText = result.valueScore
    ? ` · value ${result.valueScore.toFixed(1)} (${result.tierLabel})`
    : "";
  await sendMessage(chatId, `⭐ <b>${esc(result.title)}</b> rated ${rating}/10${tierText}`);
}

const HELP_TEXT = [
  "🎬 <b>CinemaLog bot</b>",
  "",
  "• Forward a <b>ticket screenshot / PVR SMS screenshot</b> → logs the movie",
  "• Photo with caption <b>gc</b> → logs a gift card",
  "• /tonight — top picks playing now",
  "• /gc — gift card balances + which to use",
  "• /recap — last 7 days",
  "• Just talk to me — \"what should I watch this weekend?\", \"how much did I spend in June?\", \"rate the odyssey 8.5\"",
  "",
  "I'll also ping you: rating prompts after shows, hall-occupancy captures,",
  "expiring gift cards, Thursday release digests, and Sunday recaps.",
].join("\n");

export async function POST(request: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected && request.headers.get("x-telegram-bot-api-secret-token") !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let update: any;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    const message = update.message;
    const callback = update.callback_query;
    const chatId = String(message?.chat?.id ?? callback?.message?.chat?.id ?? "");
    if (!chatId) return NextResponse.json({ ok: true });

    const allowed = allowedChatId();
    if (!allowed) {
      await sendMessage(
        chatId,
        `Almost there. Your chat id is <code>${esc(chatId)}</code> — set it as TELEGRAM_CHAT_ID in Vercel and redeploy.`
      );
      return NextResponse.json({ ok: true });
    }
    if (chatId !== allowed) {
      return NextResponse.json({ ok: true });
    }

    if (callback) {
      const dataStr: string = callback.data || "";
      const match = dataStr.match(/^rate:([0-9a-f-]+):([\d.]+)$/);
      if (match) {
        await handleRatingCallback(
          callback.id,
          chatId,
          callback.message.message_id,
          match[1],
          Number(match[2])
        );
      } else if (dataStr.startsWith("img:")) {
        await tg("answerCallbackQuery", { callback_query_id: callback.id });
        const pending = await getBotState<PendingImage>("pending_image");
        if (!pending?.fileId) {
          await sendMessage(chatId, "That image is gone — send it again.");
        } else if (dataStr === "img:ticket") {
          await setBotState("pending_image", null);
          await handleTicketPhoto(chatId, pending.fileId);
        } else if (dataStr === "img:gc") {
          await setBotState("pending_image", null);
          await handleGiftCardPhoto(chatId, pending.fileId);
        } else if (dataStr === "img:attach") {
          await setBotState("pending_image", { ...pending, mode: "await_title" });
          await sendMessage(chatId, "Which movie? Reply with the title.");
        } else {
          await setBotState("pending_image", null);
          await sendMessage(chatId, "Ignored.");
        }
      } else {
        await tg("answerCallbackQuery", { callback_query_id: callback.id });
      }
      return NextResponse.json({ ok: true });
    }

    if (!message) return NextResponse.json({ ok: true });

    const photo = message.photo?.[message.photo.length - 1];
    const document = message.document;
    const caption: string = (message.caption || "").trim().toLowerCase();

    if (photo || document) {
      const fileId = photo?.file_id || document?.file_id;
      if (caption.includes("gc") || caption.includes("gift")) {
        await handleGiftCardPhoto(chatId, fileId);
      } else if (caption.includes("ticket")) {
        await handleTicketPhoto(chatId, fileId);
      } else {
        // No explicit caption: classify first — not every image is a ticket.
        const file = await getTelegramFileBase64(fileId);
        const kind = file ? await classifyImage(file.base64, file.mime) : "ticket";
        if (kind === "gift_card") await handleGiftCardPhoto(chatId, fileId);
        else if (kind === "other") await offerImageChoices(chatId, fileId);
        else await handleTicketPhoto(chatId, fileId);
      }
      return NextResponse.json({ ok: true });
    }

    const text: string = (message.text || "").trim();
    if (!text) return NextResponse.json({ ok: true });

    // A photo is waiting for a movie title to attach to.
    const pendingImage = await getBotState<PendingImage>("pending_image");
    if (pendingImage?.mode === "await_title" && !text.startsWith("/")) {
      await attachPhotoToMovie(chatId, pendingImage.fileId, text);
      return NextResponse.json({ ok: true });
    }

    if (text === "/start" || text === "/help") {
      await sendMessage(chatId, HELP_TEXT);
    } else if (text.startsWith("/tonight")) {
      await handleTonight(chatId);
    } else if (text.startsWith("/gc")) {
      await handleGcCommand(chatId);
    } else if (text.startsWith("/recap")) {
      await handleRecap(chatId);
    } else if (!text.startsWith("/")) {
      await tg("sendChatAction", { chat_id: chatId, action: "typing" });
      const reply = await converse(text);
      // Plain text: model output isn't guaranteed to be valid Telegram HTML.
      await tg("sendMessage", { chat_id: chatId, text: reply.slice(0, 4000) });
    } else {
      await sendMessage(chatId, "Unknown command — /help lists what I can do.");
    }
  } catch (error) {
    console.error("[telegram] webhook error:", error);
  }

  // Always 200 so Telegram doesn't retry-storm.
  return NextResponse.json({ ok: true });
}
