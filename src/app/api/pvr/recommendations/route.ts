import { NextRequest, NextResponse } from "next/server";
import {
  fetchPvrComingSoon,
  fetchPvrSeatLayout,
  fetchPvrSearchMovies,
  fetchPvrSessions,
} from "@/lib/pvr/client";
import { findPvrCity, todayInIndia } from "@/lib/pvr/cities";
import { settledWithConcurrency } from "@/lib/pvr/concurrency";
import { titleMatches } from "@/lib/pvr/personal-predictor";
import {
  buildRecommendations,
  getShowsForExactPricing,
  rankPvrMovies,
} from "@/lib/pvr/recommendations";
import {
  formatMatches,
  isPastShow,
  languageMatches,
  loadRecommendationUserData,
} from "@/lib/pvr/recommendation-user-data";
import { blendCrowdRatings, enrichPvrMoviesWithTmdb } from "@/lib/pvr/tmdb-enrichment";
import type {
  PvrCacheMeta,
  PvrRecommendationsResponse,
  PvrSeatQuote,
  PvrShow,
} from "@/lib/pvr/types";

const MAX_MOVIE_CANDIDATES = 16;
const MAX_EXACT_SEAT_QUOTES = 8;
// Bounded concurrency keeps PVR from rate-limiting the burst of session/seat calls.
const SESSION_CONCURRENCY = 4;
const SEAT_CONCURRENCY = 3;
const PVR_CALL_GAP_MS = 150;

function staleFromCaches(caches: Array<PvrCacheMeta | null>): boolean {
  return caches.some((cache) => Boolean(cache?.stale));
}

function combineMovies<T extends { id: string; title: string }>(movies: T[]): T[] {
  const byKey = new Map<string, T>();

  for (const movie of movies) {
    const key = `${movie.id}:${movie.title.toLowerCase()}`;
    if (!byKey.has(key)) byKey.set(key, movie);
  }

  return Array.from(byKey.values());
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const city = findPvrCity(searchParams.get("city") || "Lucknow").name;
  const date = searchParams.get("date") || todayInIndia();
  const language = searchParams.get("language") || "ALL";
  const format = searchParams.get("format") || "ALL";
  const time = searchParams.get("time") || "08:00-24:00";
  const text = searchParams.get("text") || "";
  const genre = searchParams.get("genre") || "";

  const errors: string[] = [];

  try {
    // Telegram bot access: verified shared secret instead of a session.
    let botUserId: string | undefined;
    const botSecret = request.headers.get("x-bot-secret");
    if (botSecret && process.env.CRON_SECRET && botSecret === process.env.CRON_SECRET) {
      const { resolveBotUserId } = await import("@/lib/telegram");
      botUserId = (await resolveBotUserId()) || undefined;
    }
    const userDataResult = await loadRecommendationUserData(botUserId);
    if (userDataResult.errorResponse) return userDataResult.errorResponse;
    const { userData, localMode } = userDataResult;

    const [searchMovies, comingSoon] = await Promise.all([
      fetchPvrSearchMovies({ city, text }),
      fetchPvrComingSoon({
        city,
        languages: language === "ALL" ? "" : language,
        genres: genre,
        text,
      }),
    ]);
    const pvrMovies = combineMovies([...searchMovies.data, ...comingSoon.data]);
    // Enrich with TMDB, then fold Letterboxd in so crowd ratings aren't
    // TMDB-only (the merged list has now-showing first, which the blend
    // limit prioritises).
    const enrichedMovies = await blendCrowdRatings(
      await enrichPvrMoviesWithTmdb(pvrMovies)
    );
    const enrichedById = new Map(enrichedMovies.map((movie) => [movie.id, movie]));
    const enrichedComingSoonMovies = comingSoon.data.map(
      (movie) => enrichedById.get(movie.id) || movie
    );
    // Rank candidates from now-showing movies only — coming-soon titles have
    // no bookable sessions and would waste candidate slots + session calls;
    // they are surfaced separately in `upcoming`. Live events (sports/concert
    // screenings) can't be taste-ranked against film history, so they stay in
    // "More now playing" with an event badge.
    const nowShowingIds = new Set(searchMovies.data.map((movie) => movie.id));
    const candidates = rankPvrMovies(
      enrichedMovies.filter(
        (movie) => nowShowingIds.has(movie.id) && !movie.eventCategory
      ),
      userData,
      MAX_MOVIE_CANDIDATES
    );

    const sessionResults = await settledWithConcurrency(
      candidates,
      SESSION_CONCURRENCY,
      (candidate) =>
        fetchPvrSessions({
          city,
          movieId: candidate.movie.id,
          movieTitle: candidate.movie.title,
          date,
          language,
          format,
          time,
        }),
      PVR_CALL_GAP_MS
    );

    const sessionCaches: PvrCacheMeta[] = [];
    const shows: PvrShow[] = [];

    for (let index = 0; index < sessionResults.length; index += 1) {
      const result = sessionResults[index];
      const candidate = candidates[index];
      if (result.status === "fulfilled") {
        sessionCaches.push(result.value.cache);
        shows.push(
          ...result.value.data.filter(
            (show) =>
              !isPastShow(show, todayInIndia()) &&
              formatMatches(show.format, format) &&
              languageMatches(show.language, language)
          )
        );
      } else {
        errors.push(`${candidate.movie.title}: ${result.reason instanceof Error ? result.reason.message : "session fetch failed"}`);
      }
    }

    const initialRecommendations = buildRecommendations(
      candidates,
      shows,
      userData,
      new Map<string, PvrSeatQuote>()
    );
    const showsForExactPricing = getShowsForExactPricing(
      initialRecommendations,
      MAX_EXACT_SEAT_QUOTES
    );

    const seatResults = await settledWithConcurrency(
      showsForExactPricing,
      SEAT_CONCURRENCY,
      (show) =>
        fetchPvrSeatLayout({
          city,
          dated: show.showDate,
          encrypted: show.encrypted || "",
          showKey: show.showKey,
        }),
      PVR_CALL_GAP_MS
    );
    const seatLayoutCaches: PvrCacheMeta[] = [];
    const seatQuotes = new Map<string, PvrSeatQuote>();

    for (let index = 0; index < seatResults.length; index += 1) {
      const result = seatResults[index];
      const show = showsForExactPricing[index];
      if (result.status === "fulfilled") {
        seatLayoutCaches.push(result.value.cache);
        seatQuotes.set(show.showKey, result.value.data);
      } else {
        errors.push(`${show.movieTitle} ${show.showTime}: ${result.reason instanceof Error ? result.reason.message : "seat layout failed"}`);
      }
    }

    const recommendations = buildRecommendations(
      candidates,
      shows,
      userData,
      seatQuotes
    );

    const recommendedIds = new Set(recommendations.map((rec) => rec.movie.id));
    const watchedTitles = userData.movies.map((movie) => movie.title);
    // Watched movies stay in the list with a badge instead of disappearing.
    const otherPlaying = searchMovies.data
      .filter((movie) => !recommendedIds.has(movie.id))
      .map((movie) => {
        const enrichedMovie = enrichedById.get(movie.id) || movie;
        return {
          ...enrichedMovie,
          watched: watchedTitles.some((title) => titleMatches(enrichedMovie.title, title)),
        };
      });

    const watchlistTitles = userData.watchlist
      .filter((item) => !item.watchedMovieId)
      .map((item) => ({ title: item.title, priority: item.priority }));
    const matchWatchlist = (title: string) => {
      for (const entry of watchlistTitles) {
        if (titleMatches(title, entry.title)) return entry;
      }
      return null;
    };
    const upcoming = enrichedComingSoonMovies.slice(0, 20).map((movie) => {
      const match = matchWatchlist(movie.title);
      return {
        ...movie,
        onWatchlist: Boolean(match),
        watchlistPriority: match ? match.priority : null,
      };
    });

    const response: PvrRecommendationsResponse = {
      city,
      date,
      generatedAt: new Date().toISOString(),
      recommendations,
      upcoming,
      otherPlaying,
      diagnostics: {
        pvrMovieCount: enrichedMovies.length,
        candidateMovieCount: candidates.length,
        fetchedSessionMovieCount: sessionCaches.length,
        showCount: shows.length,
        exactSeatQuoteCount: seatQuotes.size,
        stale: staleFromCaches([searchMovies.cache, comingSoon.cache, ...sessionCaches, ...seatLayoutCaches]),
        localMode,
        errors: errors.slice(0, 8),
      },
      cache: {
        comingSoon: comingSoon.cache,
        search: searchMovies.cache,
        sessions: sessionCaches,
        seatLayouts: seatLayoutCaches,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to build recommendations",
        city,
        date,
      },
      { status: 500 }
    );
  }
}
