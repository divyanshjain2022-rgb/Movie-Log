import { findPvrCity } from "@/lib/pvr/cities";
import { durableCacheGet, durableCacheKey, durableCachePut } from "@/lib/pvr/durable-cache";
import type {
  PvrCacheMeta,
  PvrFetchResult,
  PvrMovie,
  PvrPriceRange,
  PvrSeatCategory,
  PvrSeatCell,
  PvrSeatQuote,
  PvrSeatRow,
  PvrShow,
} from "@/lib/pvr/types";

const PVR_API_BASE = "https://api3.pvrcinemas.com/api/v1/booking";
const PVR_ORIGIN = "https://www.pvrcinemas.com";

// Listing TTLs match the ~15-min cron warm cadence so page loads and bot
// queries stay on the durable cache; seat layouts are live availability and
// must stay short.
const COMING_SOON_TTL_SECONDS = 15 * 60;
const SEARCH_TTL_SECONDS = 15 * 60;
const SESSIONS_TTL_SECONDS = 15 * 60;
const SEAT_LAYOUT_TTL_SECONDS = 90;
const STALE_GRACE_SECONDS = 30 * 60;

type JsonRecord = Record<string, unknown>;

interface CacheEntry {
  data: unknown;
  expiresAt: number;
  staleUntil: number;
  fetchedAt: number;
  ttlSeconds: number;
}

interface RawPvrResult {
  data: unknown;
  cache: PvrCacheMeta;
}

export interface ComingSoonParams {
  city: string;
  languages?: string;
  genres?: string;
  text?: string;
}

export interface SearchMoviesParams {
  city: string;
  text?: string;
}

export interface SessionsParams {
  city: string;
  movieId: string;
  movieTitle: string;
  date: string;
  language?: string;
  format?: string;
  time?: string;
}

export interface SeatLayoutParams {
  city: string;
  dated: string;
  encrypted: string;
  showKey: string;
}

const responseCache = new Map<string, CacheEntry>();

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOutput(payload: unknown): unknown {
  if (isRecord(payload) && "output" in payload) return payload.output;
  return payload;
}

function pickValue(record: JsonRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record && record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return undefined;
}

function pickString(record: JsonRecord, keys: string[]): string | null {
  const value = pickValue(record, keys);
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function pickNumber(record: JsonRecord, keys: string[]): number | null {
  const value = pickValue(record, keys);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const number = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function pickArray(record: JsonRecord, keys: string[]): unknown[] {
  const value = pickValue(record, keys);
  return Array.isArray(value) ? value : [];
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const clean = value.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }

  return result;
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(
      value.flatMap((item) => {
        if (typeof item === "string") return item.split(",");
        if (typeof item === "number") return [String(item)];
        if (isRecord(item)) {
          const name = pickString(item, ["name", "value", "label", "language", "genre"]);
          return name ? [name] : [];
        }
        return [];
      })
    );
  }

  if (typeof value === "string") {
    return uniqueStrings(value.split(/[,|/]/));
  }

  return [];
}

function makeAbsoluteUrl(url: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${PVR_ORIGIN}${url}`;
  return url;
}

export function buildPvrRedirectUrl(city: string, title: string, movieId: string): string {
  return `${PVR_ORIGIN}/moviesessions/${encodeURIComponent(city)}/${encodeURIComponent(title)}/${encodeURIComponent(movieId)}`;
}

function priceRangeFromValues(values: number[]): PvrPriceRange {
  const cleanValues = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value));
  const uniqueValues = Array.from(new Set(cleanValues)).sort((a, b) => a - b);

  return {
    min: uniqueValues.length > 0 ? uniqueValues[0] : null,
    max: uniqueValues.length > 0 ? uniqueValues[uniqueValues.length - 1] : null,
    values: uniqueValues,
  };
}

function extractPrices(record: JsonRecord): PvrPriceRange {
  const prices: number[] = [];
  const pricing = pickValue(record, ["pricing", "prices", "price"]);

  if (Array.isArray(pricing)) {
    for (const item of pricing) {
      if (typeof item === "number") prices.push(item);
      if (typeof item === "string") {
        const parsed = Number(item.replace(/[^\d.-]/g, ""));
        if (Number.isFinite(parsed)) prices.push(parsed);
      }
      if (isRecord(item)) {
        const price = pickNumber(item, ["price", "amount", "value", "sp"]);
        if (price !== null) prices.push(price);
      }
    }
  } else if (typeof pricing === "number") {
    prices.push(pricing);
  } else if (typeof pricing === "string") {
    const parsed = Number(pricing.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(parsed)) prices.push(parsed);
  }

  for (const key of ["minPrice", "maxPrice", "priceFrom", "amount"]) {
    const price = pickNumber(record, [key]);
    if (price !== null) prices.push(price);
  }

  return priceRangeFromValues(prices);
}

function collectMovieCandidates(value: unknown, results: JsonRecord[], depth = 0): void {
  if (depth > 7) return;

  if (Array.isArray(value)) {
    for (const item of value) collectMovieCandidates(item, results, depth + 1);
    return;
  }

  if (!isRecord(value)) return;

  const title = pickString(value, [
    "title",
    "name",
    "n",
    "movieName",
    "filmName",
    "mname",
    "movie_title",
    "mn",
  ]);
  const id = pickString(value, [
    "id",
    "mid",
    "movieId",
    "movie_id",
    "filmId",
    "contentId",
    "cid",
    "mId",
  ]);

  if (title && id && hasMovieSignal(value)) {
    // Stop recursion: nested arrays like `films`, `experiences`, `secondaryFormats`
    // represent variants of this movie (language/format/subtitle splits), not
    // separate movies. Walking into them would produce one entry per variant.
    results.push(value);
    return;
  }

  for (const nested of Object.values(value)) {
    if (Array.isArray(nested) || isRecord(nested)) {
      collectMovieCandidates(nested, results, depth + 1);
    }
  }
}

function hasMovieSignal(record: JsonRecord): boolean {
  return [
    "title",
    "n",
    "mid",
    "movieId",
    "movie_id",
    "filmId",
    "contentId",
    "movieName",
    "filmName",
    "mname",
    "n",
    "releaseDate",
    "release_date",
    "rdate",
    "posterUrl",
    "poster",
    "imageUrl",
    "portraitImage",
    "languages",
    "movieLanguage",
    "mfs",
    "genres",
    "movieGenre",
    "grs",
  ].some((key) => key in record);
}

export function normalizePvrMovies(payload: unknown, city: string): PvrMovie[] {
  const candidates: JsonRecord[] = [];
  collectMovieCandidates(readOutput(payload), candidates);

  const movies = new Map<string, PvrMovie>();

  for (const candidate of candidates) {
    const title = pickString(candidate, [
      "title",
      "name",
      "n",
      "movieName",
      "filmName",
      "mname",
      "movie_title",
      "mn",
    ]);
    const id = pickString(candidate, [
      "id",
      "mid",
      "movieId",
      "movie_id",
      "filmId",
      "contentId",
      "cid",
      "mId",
    ]);
    if (!title || !id) continue;

    const languageSource = pickValue(candidate, [
      "languages",
      "language",
      "lang",
      "langs",
      "movieLanguage",
      "mfs",
    ]);
    const genreSource = pickValue(candidate, ["genres", "genre", "movieGenre", "grs"]);
    const posterUrl = makeAbsoluteUrl(
      pickString(candidate, [
        "posterUrl",
        "poster",
        "image",
        "imageUrl",
        "img",
        "portraitImage",
        "thumbnail",
        "miv",
      ])
    );
    const releaseDate = pickString(candidate, [
      "releaseDate",
      "release_date",
      "rdate",
      "release",
      "date",
      "openingDate",
    ]);
    const movie: PvrMovie = {
      id,
      title,
      releaseDate,
      languages: toStringList(languageSource),
      genres: toStringList(genreSource),
      posterUrl,
      redirectUrl: buildPvrRedirectUrl(city, title, id),
      source: "pvr",
      eventCategory: pickString(candidate, ["showCategory"]),
    };

    movies.set(`${id}:${normalizeToken(title)}`, movie);
  }

  // PVR release dates are strings like "Jul 02, 2026" — parse before sorting,
  // otherwise December sorts before July alphabetically.
  const releaseTime = (movie: PvrMovie): number => {
    const parsed = movie.releaseDate ? Date.parse(movie.releaseDate) : NaN;
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
  };

  return Array.from(movies.values()).sort((a, b) => {
    const timeDiff = releaseTime(a) - releaseTime(b);
    if (timeDiff !== 0) return timeDiff;
    return a.title.localeCompare(b.title);
  });
}

function getExperienceBlocks(cinemaBlock: JsonRecord): JsonRecord[] {
  const experienceSessions = pickArray(cinemaBlock, [
    "experienceSessions",
    "experiences",
    "formats",
  ]).filter(isRecord);
  if (experienceSessions.length > 0) return experienceSessions;

  if (pickArray(cinemaBlock, ["shows", "sessions", "showtimes"]).length > 0) {
    return [cinemaBlock];
  }

  return [];
}

function getShowBlocks(experienceBlock: JsonRecord): JsonRecord[] {
  return pickArray(experienceBlock, ["shows", "sessions", "showtimes"]).filter(isRecord);
}

function normalizeShowTime(time: string): string {
  const match = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return time;
  let hour = Number(match[1]);
  const period = match[3]?.toUpperCase();

  if (period === "PM" && hour < 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;

  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

export function normalizePvrSessions(payload: unknown, params: SessionsParams): PvrShow[] {
  const output = readOutput(payload);
  const outputRecord = isRecord(output) ? output : {};
  const cinemaBlocks = (
    pickArray(outputRecord, [
      "movieCinemaSessions",
      "cinemaSessions",
      "cinemas",
      "sessions",
    ]).filter(isRecord)
  );
  const shows: PvrShow[] = [];

  for (const cinemaBlock of cinemaBlocks) {
    const cinemaRecord = isRecord(cinemaBlock.cinema) ? cinemaBlock.cinema : cinemaBlock;
    const cinemaName = pickString(cinemaRecord, [
      "name",
      "cinemaName",
      "theatreName",
      "theaterName",
    ]) || "PVR Cinema";
    const cinemaId = pickString(cinemaRecord, ["id", "cid", "cinemaId", "theaterId"]);

    for (const experienceBlock of getExperienceBlocks(cinemaBlock)) {
      const format = pickString(experienceBlock, [
        "experience",
        "format",
        "name",
        "experienceName",
        "sessionFormat",
      ]) || params.format || "Regular";

      for (const showBlock of getShowBlocks(experienceBlock)) {
        const showTimeRaw = pickString(showBlock, [
          "showTime",
          "showtime",
          "time",
          "startTime",
        ]);
        const showDate = pickString(showBlock, ["showDate", "date", "dated"]) || params.date;
        if (!showTimeRaw || !showDate) continue;

        const showTime = normalizeShowTime(showTimeRaw);
        const screenId = pickString(showBlock, ["screenId", "screen_id", "auditoriumId"]);
        const screenName = pickString(showBlock, [
          "screenName",
          "screen",
          "audi",
          "auditorium",
        ]);
        const language = pickString(showBlock, [
          "language",
          "lang",
          "lng",
          "movieLanguage",
        ]);
        const encrypted = pickString(showBlock, ["encrypted", "enc", "e"]);
        const totalSeats = pickNumber(showBlock, ["totalSeats", "total", "capacity"]);
        const availableSeats = pickNumber(showBlock, [
          "availableSeats",
          "available",
          "avail",
          "seatsAvailable",
        ]);
        const priceRange = extractPrices(showBlock);
        const showKey = [
          params.movieId,
          cinemaId || cinemaName,
          screenId || screenName || "screen",
          showDate,
          showTime,
          encrypted || "no-token",
        ].join("|");

        shows.push({
          showKey,
          movieId: params.movieId,
          movieTitle: params.movieTitle,
          city: params.city,
          cinemaName,
          cinemaId,
          screenId,
          screenName,
          showDate,
          showTime,
          format,
          language: language && language !== "ALL" ? language : null,
          encrypted,
          totalSeats,
          availableSeats,
          priceRange,
          redirectUrl: buildPvrRedirectUrl(params.city, params.movieTitle, params.movieId),
        });
      }
    }
  }

  return shows;
}

function getCategoryQualityWeight(description: string): number {
  const normalized = normalizeToken(description);
  if (/insignia|luxe|recliner|lounger|sofa|luxury/.test(normalized)) return 1.35;
  if (/prime plus|premium|club|prime/.test(normalized)) return 1.15;
  if (/classic|standard|regular|normal/.test(normalized)) return 1;
  return 1.05;
}

function getRecommendedSeatCategory(categories: PvrSeatCategory[]): PvrSeatCategory | null {
  const available = categories.filter(
    (category) => category.availableSeats > 0 && category.price > 0
  );
  if (available.length === 0) return null;

  const cheapest = Math.min(...available.map((category) => category.price));
  return [...available].sort((a, b) => {
    const aValue = (a.qualityWeight / a.price) * 1000;
    const bValue = (b.qualityWeight / b.price) * 1000;
    const aPremiumWithinReach = a.price <= cheapest * 1.2 ? 0.08 : 0;
    const bPremiumWithinReach = b.price <= cheapest * 1.2 ? 0.08 : 0;
    return (bValue + bPremiumWithinReach) - (aValue + aPremiumWithinReach);
  })[0];
}

export function normalizePvrSeatLayout(
  payload: unknown,
  showKey: string
): PvrSeatQuote {
  const output = readOutput(payload);
  const outputRecord = isRecord(output) ? output : {};
  const priceList = isRecord(outputRecord.priceList) ? outputRecord.priceList : {};
  const rows = pickArray(outputRecord, ["rows", "seatLayout", "layout"]);

  const counts = new Map<string, { totalSeats: number; availableSeats: number }>();
  const layoutRows: PvrSeatRow[] = [];

  for (const row of rows) {
    if (!isRecord(row)) continue;
    // Rows with type "area" are section headers (e.g. "CLUB"), not seat rows.
    if (pickString(row, ["t", "type"]) === "area") continue;

    const rowLabel = pickString(row, ["n", "row", "rowName", "rn", "label", "rowLabel"]);
    const seats = pickArray(row, ["s", "seats", "seat"]);
    const cells: PvrSeatCell[] = [];

    for (const seat of seats) {
      if (!isRecord(seat)) continue;
      // Field meanings (verified against the live PVR layout):
      //   c/pc  = price category — a cell with one is a real seat; without = aisle/gap
      //   s     = sale state: 1 = available to book, 2 = unavailable (sold OR blocked by cinema)
      //   st    = special-seat marker (0 normal, 1/2 = wheelchair/companion) — NOT sold, ignore here
      const categoryCode = pickString(seat, ["c", "pc", "category", "classCode", "showClass"]);
      const seatType = pickNumber(seat, ["s", "seatType"]);
      const seatId = pickString(seat, ["sn", "seatNumber", "displaynumber", "seatNo"]);
      const isSeat = Boolean(categoryCode);
      const available = isSeat && seatType !== 2;

      cells.push({
        id: seatId,
        status: !isSeat ? "gap" : available ? "available" : "taken",
        categoryCode,
      });

      if (isSeat) {
        const current = counts.get(categoryCode!) || { totalSeats: 0, availableSeats: 0 };
        current.totalSeats += 1;
        if (available) current.availableSeats += 1;
        counts.set(categoryCode!, current);
      }
    }

    if (cells.length > 0) layoutRows.push({ label: rowLabel, seats: cells });
  }

  const categoryCodes = new Set<string>([
    ...Object.keys(priceList),
    ...Array.from(counts.keys()),
  ]);
  const categories: PvrSeatCategory[] = [];

  for (const code of categoryCodes) {
    const priceRecord = isRecord(priceList[code]) ? priceList[code] : {};
    const description = pickString(priceRecord, ["description", "desc", "name"]) || code;
    const price = pickNumber(priceRecord, ["price", "amount", "value"]) || 0;
    const count = counts.get(code) || { totalSeats: 0, availableSeats: 0 };

    categories.push({
      code,
      description,
      price,
      totalSeats: count.totalSeats,
      availableSeats: count.availableSeats,
      soldSeats: Math.max(count.totalSeats - count.availableSeats, 0),
      qualityWeight: getCategoryQualityWeight(description),
    });
  }

  categories.sort((a, b) => a.price - b.price || a.description.localeCompare(b.description));
  const recommendedCategory = getRecommendedSeatCategory(categories);
  const pricedCategories = categories.filter((category) => category.price > 0);

  return {
    showKey,
    categories,
    recommendedCategory,
    minPrice: pricedCategories.length > 0 ? pricedCategories[0].price : null,
    maxPrice: pricedCategories.length > 0 ? pricedCategories[pricedCategories.length - 1].price : null,
    availableSeatCount: categories.reduce((sum, category) => sum + category.availableSeats, 0),
    rows: layoutRows,
  };
}

function getPvrHeaders(city: string): HeadersInit {
  const token = process.env.PVR_BEARER_TOKEN;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    Authorization: token ? `Bearer ${token}` : "Bearer",
    chain: "PVR",
    appVersion: "1.0",
    platform: "WEBSITE",
    city,
    country: "INDIA",
    Origin: PVR_ORIGIN,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15",
  };

  return headers;
}

async function postPvrJson(
  endpoint: string,
  city: string,
  body: JsonRecord,
  ttlSeconds: number
): Promise<RawPvrResult> {
  const cacheKey = JSON.stringify({ endpoint, city, body });
  const now = Date.now();
  const cached = responseCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return {
      data: cached.data,
      cache: {
        cached: true,
        stale: false,
        fetchedAt: new Date(cached.fetchedAt).toISOString(),
        ttlSeconds: cached.ttlSeconds,
      },
    };
  }

  // Memory miss: another instance (or the cron warmer) may have a fresh row.
  const durableKey = durableCacheKey(endpoint, city, body);
  const durable = await durableCacheGet(durableKey);
  if (durable && durable.expiresAt > now) {
    responseCache.set(cacheKey, {
      data: durable.data,
      expiresAt: durable.expiresAt,
      staleUntil: durable.staleUntil,
      fetchedAt: durable.fetchedAt,
      ttlSeconds: durable.ttlSeconds,
    });
    return {
      data: durable.data,
      cache: {
        cached: true,
        stale: false,
        fetchedAt: new Date(durable.fetchedAt).toISOString(),
        ttlSeconds: durable.ttlSeconds,
      },
    };
  }

  try {
    const response = await fetch(`${PVR_API_BASE}${endpoint}`, {
      method: "POST",
      headers: getPvrHeaders(city),
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`PVR ${endpoint} returned ${response.status}`);
    }

    const data: unknown = await response.json();
    responseCache.set(cacheKey, {
      data,
      expiresAt: now + ttlSeconds * 1000,
      staleUntil: now + (ttlSeconds + STALE_GRACE_SECONDS) * 1000,
      fetchedAt: now,
      ttlSeconds,
    });
    await durableCachePut(durableKey, endpoint, data, now, ttlSeconds, STALE_GRACE_SECONDS);

    return {
      data,
      cache: {
        cached: false,
        stale: false,
        fetchedAt: new Date(now).toISOString(),
        ttlSeconds,
      },
    };
  } catch (error) {
    if (cached && cached.staleUntil > now) {
      return {
        data: cached.data,
        cache: {
          cached: true,
          stale: true,
          fetchedAt: new Date(cached.fetchedAt).toISOString(),
          ttlSeconds: cached.ttlSeconds,
        },
      };
    }
    if (durable && durable.staleUntil > now) {
      return {
        data: durable.data,
        cache: {
          cached: true,
          stale: true,
          fetchedAt: new Date(durable.fetchedAt).toISOString(),
          ttlSeconds: durable.ttlSeconds,
        },
      };
    }

    throw error;
  }
}

export async function fetchPvrComingSoon(
  params: ComingSoonParams
): Promise<PvrFetchResult<PvrMovie[]>> {
  const city = findPvrCity(params.city).name;
  const result = await postPvrJson(
    "/content/comingsoon",
    city,
    {
      city,
      languages: params.languages || "",
      genres: params.genres || "",
      text: params.text || "",
    },
    COMING_SOON_TTL_SECONDS
  );

  return {
    data: normalizePvrMovies(result.data, city),
    cache: result.cache,
  };
}

export async function fetchPvrSearchMovies(
  params: SearchMoviesParams
): Promise<PvrFetchResult<PvrMovie[]>> {
  const city = findPvrCity(params.city);
  const result = await postPvrJson(
    "/content/search",
    city.name,
    {
      city: city.name,
      lat: city.lat,
      lng: city.lng,
      type: "HOME",
    },
    SEARCH_TTL_SECONDS
  );
  // PVR returns now-showing movies in `output.ns` and upcoming in `output.cs`.
  // Only ns has playable sessions; cs is covered by fetchPvrComingSoon.
  const resultRecord = isRecord(result.data) ? result.data : {};
  const outputRecord = isRecord(resultRecord.output) ? resultRecord.output : {};
  const nsPayload = outputRecord.ns ?? [];
  const text = params.text?.trim().toLowerCase();
  const movies = normalizePvrMovies(nsPayload, city.name);

  return {
    data: text
      ? movies.filter((movie) => movie.title.toLowerCase().includes(text))
      : movies,
    cache: result.cache,
  };
}

export async function fetchPvrSessions(
  params: SessionsParams
): Promise<PvrFetchResult<PvrShow[]>> {
  const city = findPvrCity(params.city);
  const language = params.language && params.language !== "ALL" ? params.language : "ALL";
  const format = params.format && params.format !== "ALL" ? params.format : "ALL";
  const result = await postPvrJson(
    "/content/msessions",
    city.name,
    {
      city: city.name,
      mid: params.movieId,
      experience: "ALL",
      specialTag: "ALL",
      lat: city.lat,
      lng: city.lng,
      lang: language,
      format,
      dated: params.date || "NA",
      time: params.time || "08:00-24:00",
      cinetype: "ALL",
      hc: "ALL",
      adFree: false,
    },
    SESSIONS_TTL_SECONDS
  );

  return {
    data: normalizePvrSessions(result.data, {
      ...params,
      city: city.name,
      language,
      format,
    }),
    cache: result.cache,
  };
}

export async function fetchPvrSeatLayout(
  params: SeatLayoutParams
): Promise<PvrFetchResult<PvrSeatQuote>> {
  const city = findPvrCity(params.city).name;
  const result = await postPvrJson(
    "/ticketing/seatlayout",
    city,
    {
      dated: params.dated,
      encrypted: params.encrypted,
      onPage: false,
      layoutType: "NEW",
    },
    SEAT_LAYOUT_TTL_SECONDS
  );

  return {
    data: normalizePvrSeatLayout(result.data, params.showKey),
    cache: result.cache,
  };
}
