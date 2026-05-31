import { NextRequest, NextResponse } from "next/server";
import { fetchPvrSeatLayout, fetchPvrSessions } from "@/lib/pvr/client";
import { findPvrCity, todayInIndia } from "@/lib/pvr/cities";
import {
  buildRecommendations,
  getShowsForExactPricing,
  type RankedMovieCandidate,
} from "@/lib/pvr/recommendations";
import {
  buildPersonalPredictionModel,
  predictMoviePersonalFit,
} from "@/lib/pvr/personal-predictor";
import {
  formatMatches,
  isPastShow,
  languageMatches,
  loadRecommendationUserData,
} from "@/lib/pvr/recommendation-user-data";
import type {
  PvrMovie,
  PvrSeatQuote,
  PvrShow,
} from "@/lib/pvr/types";

// On-demand sessions + exact pricing for a single movie the user pulls in from
// "Now playing". Keeps the main recommendations endpoint light by not fanning
// out PVR calls for every title up front.
const MAX_EXACT_SEAT_QUOTES = 6;

interface MovieSessionRequest {
  city?: string;
  date?: string;
  language?: string;
  format?: string;
  time?: string;
  movie?: PvrMovie;
}

export async function POST(request: NextRequest) {
  let body: MovieSessionRequest;
  try {
    body = (await request.json()) as MovieSessionRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const movie = body.movie;
  if (!movie || !movie.id || !movie.title) {
    return NextResponse.json({ error: "Missing movie" }, { status: 400 });
  }

  const city = findPvrCity(body.city || "Lucknow").name;
  const date = body.date || todayInIndia();
  const language = body.language || "ALL";
  const format = body.format || "ALL";
  const time = body.time || "08:00-24:00";

  const errors: string[] = [];

  try {
    const userDataResult = await loadRecommendationUserData();
    if (userDataResult.errorResponse) return userDataResult.errorResponse;
    const { userData } = userDataResult;

    const model = buildPersonalPredictionModel(userData);
    const candidate: RankedMovieCandidate = {
      movie,
      fit: predictMoviePersonalFit(movie, model),
    };

    const sessionResult = await fetchPvrSessions({
      city,
      movieId: movie.id,
      movieTitle: movie.title,
      date,
      language,
      format,
      time,
    });

    const shows: PvrShow[] = sessionResult.data.filter(
      (show) =>
        !isPastShow(show, todayInIndia()) &&
        formatMatches(show.format, format) &&
        languageMatches(show.language, language)
    );

    if (shows.length === 0) {
      return NextResponse.json({
        recommendation: null,
        showCount: 0,
        exactSeatQuoteCount: 0,
        stale: sessionResult.cache.stale,
        errors,
      });
    }

    const initialRecommendations = buildRecommendations(
      [candidate],
      shows,
      userData,
      new Map<string, PvrSeatQuote>()
    );
    const showsForExactPricing = getShowsForExactPricing(
      initialRecommendations,
      MAX_EXACT_SEAT_QUOTES
    );

    const seatResults = await Promise.allSettled(
      showsForExactPricing.map((show) =>
        fetchPvrSeatLayout({
          city,
          dated: show.showDate,
          encrypted: show.encrypted || "",
          showKey: show.showKey,
        })
      )
    );
    const seatQuotes = new Map<string, PvrSeatQuote>();
    for (let index = 0; index < seatResults.length; index += 1) {
      const result = seatResults[index];
      const show = showsForExactPricing[index];
      if (result.status === "fulfilled") {
        seatQuotes.set(show.showKey, result.value.data);
      } else {
        errors.push(
          `${show.movieTitle} ${show.showTime}: ${result.reason instanceof Error ? result.reason.message : "seat layout failed"}`
        );
      }
    }

    const recommendations = buildRecommendations([candidate], shows, userData, seatQuotes);

    return NextResponse.json({
      recommendation: recommendations[0] || null,
      showCount: shows.length,
      exactSeatQuoteCount: seatQuotes.size,
      stale: sessionResult.cache.stale,
      errors: errors.slice(0, 4),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load showtimes",
      },
      { status: 500 }
    );
  }
}
