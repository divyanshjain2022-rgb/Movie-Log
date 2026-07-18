import { NextRequest, NextResponse } from "next/server";
import {
  fetchPvrSearchMovies,
  fetchPvrSeatLayout,
  fetchPvrSessions,
} from "@/lib/pvr/client";
import { findPvrCity, todayInIndia } from "@/lib/pvr/cities";
import { titleMatches } from "@/lib/pvr/personal-predictor";
import type { PvrShow } from "@/lib/pvr/types";
import type { MovieSeatSnapshot } from "@/types";

interface OccupancyRequest {
  city?: string;
  title?: string;
  theaterName?: string | null;
  date?: string;
  showtime?: string | null;
  format?: string | null;
  audi?: string | null;
}

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Brand/venue filler that appears inconsistently between a ticket's theater
// name and PVR's API name (e.g. logged "Phoenix Palassio Lucknow" vs API
// "INOX Megaplex Phoenix Palassio Mall Lucknow"). Substring matching breaks
// on these, so we match on the remaining distinctive tokens instead.
const GENERIC_THEATER_TOKENS = new Set([
  "pvr", "inox", "cinema", "cinemas", "multiplex", "megaplex", "superplex",
  "icon", "luxe", "imax", "mall", "the",
]);

function theaterTokens(value: string): string[] {
  return norm(value)
    .split(" ")
    .filter((token) => token && !GENERIC_THEATER_TOKENS.has(token));
}

// 0..1: fraction of the target theater's distinctive tokens present in the
// show's cinema name.
function theaterMatchScore(cinemaName: string, target: string | null): number {
  if (!target) return 1;
  const targetTokens = theaterTokens(target);
  if (targetTokens.length === 0) return 1;
  const showTokens = new Set(theaterTokens(cinemaName));
  const hits = targetTokens.filter((token) => showTokens.has(token)).length;
  return hits / targetTokens.length;
}

function hhmm(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

// Trailing screen/audi number, e.g. "Screen 5" -> "5", "AUDI 05" -> "5".
function audiNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.match(/(\d+)\s*$/);
  return m ? String(Number(m[1])) : null;
}

export async function POST(request: NextRequest) {
  let body: OccupancyRequest;
  try {
    body = (await request.json()) as OccupancyRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.title) {
    return NextResponse.json({ error: "Missing movie title" }, { status: 400 });
  }

  const city = findPvrCity(body.city || "Lucknow").name;
  const date = body.date || todayInIndia();
  const targetTime = hhmm(body.showtime);
  const targetTheater = body.theaterName ? norm(body.theaterName) : null;
  const targetFormat = body.format ? norm(body.format) : null;
  const targetAudi = audiNumber(body.audi);

  try {
    // 1. Find all PVR movies whose title matches (a title can map to several ids,
    //    e.g. a dead duplicate + the live one) — we'll try each until one yields shows.
    const search = await fetchPvrSearchMovies({ city, text: body.title });
    const matchedMovies = search.data.filter((m) => titleMatches(m.title, body.title!));
    if (matchedMovies.length === 0) {
      return NextResponse.json({ found: false, reason: "Movie isn't currently listed at PVR" });
    }

    // 2. Gather every bookable show across the matching ids. Theater is a
    //    scored signal, not a hard filter — PVR's venue names rarely match a
    //    ticket's wording exactly (IMAX halls especially: "INOX Megaplex
    //    Phoenix Palassio Mall" vs a logged "Phoenix Palassio").
    // ±15 min tolerance absorbs listing drift (ticket 16:20 vs PVR 16:25)
    // while still refusing to capture a different screening's occupancy.
    const timeToMinutes = (value: string | null): number | null => {
      const m = value?.match(/^(\d{2}):(\d{2})$/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    };
    const targetMinutes = timeToMinutes(targetTime);
    const matchesTime = (show: PvrShow) => {
      if (targetMinutes === null) return true;
      const showMinutes = timeToMinutes(hhmm(show.showTime));
      return showMinutes !== null && Math.abs(showMinutes - targetMinutes) <= 15;
    };

    const candidateShows: PvrShow[] = [];
    for (const movie of matchedMovies.slice(0, 4)) {
      const sessions = await fetchPvrSessions({
        city,
        movieId: movie.id,
        movieTitle: movie.title,
        date,
        language: "ALL",
        format: "ALL",
        time: "08:00-24:00",
      });
      candidateShows.push(...sessions.data.filter((s) => s.encrypted));
    }

    if (candidateShows.length === 0) {
      return NextResponse.json({
        found: false,
        reason: `PVR lists no bookable shows for "${matchedMovies[0].title}" on ${date}`,
      });
    }

    // 3. Score: theater dominates (exact token match beats everything except a
    //    combined time+partial-theater hit), then time, format, audi.
    const score = (s: PvrShow) => {
      const theater = theaterMatchScore(s.cinemaName, targetTheater);
      return (
        (theater >= 0.99 ? 8 : theater >= 0.5 ? 4 : 0) +
        (matchesTime(s) ? 6 : 0) +
        (targetFormat && norm(s.format).includes(targetFormat) ? 3 : 0) +
        (targetAudi && audiNumber(s.screenName) === targetAudi ? 1 : 0)
      );
    };
    const ranked = [...candidateShows].sort((a, b) => score(b) - score(a));
    const show = ranked[0];

    // Refuse clearly-wrong captures: a ticket showtime that matches nothing
    // (the show likely started and left the listings), or no time given and
    // the theater doesn't line up either. Capturing a different screening
    // would silently record the wrong hall's occupancy.
    if ((targetMinutes !== null && !matchesTime(show)) || (score(show) < 6 && (targetTime || targetTheater))) {
      const nearTheater = targetTheater
        ? ranked.filter((s) => theaterMatchScore(s.cinemaName, targetTheater) >= 0.5)
        : ranked;
      const availableTimes = Array.from(
        new Set((nearTheater.length > 0 ? nearTheater : ranked).map((s) => hhmm(s.showTime)))
      )
        .filter(Boolean)
        .sort()
        .slice(0, 8);
      return NextResponse.json({
        found: false,
        reason: `No show matching ${targetTime || "your ticket"} at ${
          body.theaterName || "your theater"
        } — PVR lists ${availableTimes.join(", ") || "no times"} (${
          Array.from(new Set(candidateShows.map((s) => s.cinemaName))).slice(0, 3).join("; ")
        })`,
      });
    }

    if (!show.encrypted) {
      return NextResponse.json({ found: false, reason: "Show has no live seat data" });
    }

    // 4. Snapshot the live seat layout.
    const quote = await fetchPvrSeatLayout({
      city,
      dated: show.showDate,
      encrypted: show.encrypted,
      showKey: show.showKey,
    });

    const totalSeats = quote.data.categories.reduce((sum, c) => sum + c.totalSeats, 0);
    const availableSeats = quote.data.categories.reduce((sum, c) => sum + c.availableSeats, 0);
    const soldSeats = Math.max(totalSeats - availableSeats, 0);

    // PVR returns an empty layout (HTTP 200, "Session Not Found") once a show has
    // started — the seat map / occupancy is only available while booking is open.
    if (totalSeats === 0) {
      return NextResponse.json({
        found: false,
        reason: "PVR closes the seat map once the show starts — occupancy is only available before showtime.",
      });
    }
    const occupancyPct = totalSeats > 0 ? Math.round((soldSeats / totalSeats) * 1000) / 10 : 0;

    const snapshot: MovieSeatSnapshot = {
      capturedAt: new Date().toISOString(),
      occupancyPct,
      totalSeats,
      availableSeats,
      soldSeats,
      cinemaName: show.cinemaName,
      screenName: show.screenName,
      showTime: show.showTime,
      categories: quote.data.categories.map((c) => ({
        code: c.code,
        description: c.description,
        price: c.price,
        totalSeats: c.totalSeats,
        availableSeats: c.availableSeats,
        soldSeats: c.soldSeats,
      })),
      rows: quote.data.rows,
    };

    return NextResponse.json({ found: true, occupancy: occupancyPct, seatMap: snapshot });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to capture occupancy" },
      { status: 500 }
    );
  }
}
