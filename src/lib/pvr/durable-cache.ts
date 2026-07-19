import { createHash } from "crypto";
import { serviceClient } from "@/lib/telegram";

// Supabase-backed layer under the in-memory PVR cache (see postPvrJson).
// Serverless instances are short-lived, so the memory cache alone means most
// prod requests hit PVR cold; rows in pvr_cache survive instance turnover
// and let the cron pre-warm responses. Absent table or service key just
// means every lookup is a miss — the caller falls through to the network.

export interface DurableEntry {
  data: unknown;
  fetchedAt: number;
  ttlSeconds: number;
  expiresAt: number;
  staleUntil: number;
}

export function durableCacheKey(endpoint: string, city: string, body: unknown): string {
  const hash = createHash("sha256")
    .update(JSON.stringify({ city, body }))
    .digest("hex")
    .slice(0, 32);
  return `${endpoint}:${hash}`;
}

export async function durableCacheGet(key: string): Promise<DurableEntry | null> {
  const db = serviceClient();
  if (!db) return null;
  try {
    const { data: row } = await db
      .from("pvr_cache")
      .select("data, fetched_at, ttl_seconds, expires_at, stale_until")
      .eq("key", key)
      .maybeSingle();
    if (!row) return null;
    const typed = row as {
      data: unknown;
      fetched_at: string;
      ttl_seconds: number;
      expires_at: string;
      stale_until: string;
    };
    return {
      data: typed.data,
      fetchedAt: new Date(typed.fetched_at).getTime(),
      ttlSeconds: typed.ttl_seconds,
      expiresAt: new Date(typed.expires_at).getTime(),
      staleUntil: new Date(typed.stale_until).getTime(),
    };
  } catch {
    return null;
  }
}

export async function durableCachePut(
  key: string,
  endpoint: string,
  data: unknown,
  fetchedAt: number,
  ttlSeconds: number,
  staleGraceSeconds: number
): Promise<void> {
  const db = serviceClient();
  if (!db) return;
  try {
    await db.from("pvr_cache").upsert({
      key,
      endpoint,
      data,
      fetched_at: new Date(fetchedAt).toISOString(),
      ttl_seconds: ttlSeconds,
      expires_at: new Date(fetchedAt + ttlSeconds * 1000).toISOString(),
      stale_until: new Date(fetchedAt + (ttlSeconds + staleGraceSeconds) * 1000).toISOString(),
    });
  } catch {
    // Cache writes are best-effort; the response is already in hand.
  }
}
