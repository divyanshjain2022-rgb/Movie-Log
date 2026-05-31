import { NextRequest, NextResponse } from "next/server";
import {
  fetchPvrComingSoon,
  fetchPvrSeatLayout,
  fetchPvrSearchMovies,
  fetchPvrSessions,
} from "@/lib/pvr/client";
import { findPvrCity, todayInIndia } from "@/lib/pvr/cities";
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
import { enrichPvrMoviesWithTmdb } from "@/lib/pvr/tmdb-enrichment";
import type {
  PvrCacheMeta,
  PvrRecommendationsResponse,
  PvrSeatQuote,
  PvrShow,
} from "@/lib/pvr/types";

const MAX_MOVIE_CANDIDATES = 16;
const MAX_EXACT_SEAT_QUOTES = 8;

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
    const userDataResult = await loadRecommendationUserData();
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
    const enrichedMovies = await enrichPvrMoviesWithTmdb(pvrMovies);
    const enrichedById = new Map(enrichedMovies.map((movie) => [movie.id, movie]));
    const enrichedComingSoonMovies = comingSoon.data.map(
      (movie) => enrichedById.get(movie.id) || movie
    );
    const candidates = rankPvrMovies(
      enrichedMovies,
      userData,
      MAX_MOVIE_CANDIDATES
    );

    const sessionResults = await Promise.allSettled(
      candidates.map((candidate) =>
        fetchPvrSessions({
          city,
          movieId: candidate.movie.id,
          movieTitle: candidate.movie.title,
          date,
          language,
          format,
          time,
        })
      )
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
    const watchedTitleTokens = new Set(
      userData.movies
        .map((movie) => movie.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
        .filter(Boolean)
    );
    const otherPlaying = searchMovies.data.filter((movie) => {
      const enrichedMovie = enrichedById.get(movie.id) || movie;
      if (recommendedIds.has(movie.id)) return false;
      const normalized = enrichedMovie.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!normalized) return true;
      for (const watched of watchedTitleTokens) {
        if (watched === normalized || watched.includes(normalized) || normalized.includes(watched)) {
          return false;
        }
      }
      return true;
    }).map((movie) => enrichedById.get(movie.id) || movie);

    const normalizeTitle = (value: string) =>
      value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const watchlistTitles = userData.watchlist
      .filter((item) => !item.watchedMovieId)
      .map((item) => ({ key: normalizeTitle(item.title), priority: item.priority }));
    const matchWatchlist = (title: string) => {
      const normalized = normalizeTitle(title);
      if (!normalized) return null;
      for (const entry of watchlistTitles) {
        if (
          entry.key === normalized ||
          entry.key.includes(normalized) ||
          normalized.includes(entry.key)
        ) {
          return entry;
        }
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
