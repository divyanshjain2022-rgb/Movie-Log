// Telegram bot plumbing: Bot API helpers, service-role Supabase access, and
// tiny persisted state for cron dedupe. Single-user by design — the bot talks
// to one allowlisted chat and acts as the app's sole account.

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

const TELEGRAM_API = "https://api.telegram.org";

export const SITE_URL = process.env.SITE_URL || "https://movie-log-eight.vercel.app";

export function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

export function allowedChatId(): string | null {
  return process.env.TELEGRAM_CHAT_ID || null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function tg(method: string, payload: Record<string, unknown>): Promise<any> {
  const token = botToken();
  if (!token) return null;
  try {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await response.json();
  } catch {
    return null;
  }
}

export function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendMessage(
  chatId: string | number,
  text: string,
  extra: Record<string, unknown> = {}
) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...extra,
  });
}

// Push to the allowlisted chat (no-op until TELEGRAM_CHAT_ID is configured).
export async function notify(text: string, extra: Record<string, unknown> = {}) {
  const chat = allowedChatId();
  if (chat) await sendMessage(chat, text, extra);
}

export async function getTelegramFileBase64(
  fileId: string
): Promise<{ base64: string; mime: string } | null> {
  const token = botToken();
  if (!token) return null;
  const info = await tg("getFile", { file_id: fileId });
  const path: string | undefined = info?.result?.file_path;
  if (!path) return null;
  const response = await fetch(`${TELEGRAM_API}/file/bot${token}/${path}`);
  if (!response.ok) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  const mime = path.endsWith(".png")
    ? "image/png"
    : path.endsWith(".pdf")
      ? "application/pdf"
      : "image/jpeg";
  return { base64: buffer.toString("base64"), mime };
}

let cachedService: SupabaseClient | null = null;
export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!cachedService) {
    cachedService = createSupabaseClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedService;
}

// Single-user app: the account is whoever owns the movies.
let cachedUserId: string | null = null;
export async function resolveBotUserId(): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  const supabase = serviceClient();
  if (!supabase) return null;
  const { data } = await supabase.from("movies").select("user_id").limit(1).maybeSingle();
  cachedUserId = (data as { user_id?: string } | null)?.user_id || null;
  return cachedUserId;
}

export async function getBotState<T>(key: string): Promise<T | null> {
  const supabase = serviceClient();
  if (!supabase) return null;
  const { data } = await supabase.from("bot_state").select("value").eq("key", key).maybeSingle();
  return ((data as { value?: T } | null)?.value as T) ?? null;
}

export async function setBotState(key: string, value: unknown): Promise<void> {
  const supabase = serviceClient();
  if (!supabase) return;
  await supabase
    .from("bot_state")
    .upsert({ key, value, updated_at: new Date().toISOString() } as never);
}

// ---- IST time helpers (all scheduling happens in Asia/Kolkata) ----

function istParts(): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(new Date());
  const out: Record<string, string> = {};
  for (const part of parts) out[part.type] = part.value;
  return out;
}

export function istDateString(): string {
  const p = istParts();
  return `${p.year}-${p.month}-${p.day}`;
}

export function istMinutesOfDay(): number {
  const p = istParts();
  return Number(p.hour) * 60 + Number(p.minute);
}

export function istWeekday(): string {
  return istParts().weekday; // "Mon" .. "Sun"
}

export function minutesFromTime(value: string | null | undefined): number | null {
  const match = value?.match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
