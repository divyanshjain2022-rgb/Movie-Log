import { NextRequest, NextResponse } from "next/server";
import {
  fetchPvrSearchMovies,
  fetchPvrSeatLayout,
  fetchPvrSessions,
} from "@/lib/pvr/client";
import { findPvrCity, todayInIndia } from "@/lib/pvr/cities";
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

function titleMatches(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
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

    // 2. Gather candidate shows across all matching ids.
    const matchesTheater = (show: PvrShow) =>
      !targetTheater ||
      norm(show.cinemaName).includes(targetTheater) ||
      targetTheater.includes(norm(show.cinemaName));
    const matchesTime = (show: PvrShow) => !targetTime || hhmm(show.showTime) === targetTime;

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
      candidateShows.push(...sessions.data.filter((s) => s.encrypted && matchesTheater(s)));
    }

    if (candidateShows.length === 0) {
      return NextResponse.json({ found: false, reason: "No matching PVR showtime found" });
    }

    // 3. Score: prefer same time, then same format, then same audi.
    const score = (s: PvrShow) =>
      (matchesTime(s) ? 4 : 0) +
      (targetFormat && norm(s.format).includes(targetFormat) ? 2 : 0) +
      (targetAudi && audiNumber(s.screenName) === targetAudi ? 1 : 0);
    const show = [...candidateShows].sort((a, b) => score(b) - score(a))[0];

    if (!show.encrypted) {
      return NextResponse.json({ found: false, reason: "Show has no live seat data" });
    }

    // 3. Snapshot the live seat layout.
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
