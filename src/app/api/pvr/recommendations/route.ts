import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canUseLocalSupabaseFallback, hasSupabaseConfig } from "@/lib/supabase/config";
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
import { LOCAL_RECOMMENDATION_USER_DATA } from "@/lib/pvr/local-user-data";
import { enrichPvrMoviesWithTmdb } from "@/lib/pvr/tmdb-enrichment";
import type {
  PvrCacheMeta,
  PvrRecommendationsResponse,
  PvrSeatQuote,
  PvrShow,
  RecommendationUserData,
  UserFranchise,
  UserFormatPreference,
  UserMovieForRecommendation,
  UserRewatchOption,
  UserTheaterPreference,
  UserTheaterRating,
  UserWatchlistItem,
} from "@/lib/pvr/types";
import type { FormulaParams } from "@/types";

const MAX_MOVIE_CANDIDATES = 16;
const MAX_EXACT_SEAT_QUOTES = 8;

interface MovieRow {
  id: string;
  title: string;
  rating: number | null;
  showtime: string | null;
  genres: string[] | null;
  language: string | null;
  director: string | null;
  cast_members: string[] | null;
  keywords: string[] | null;
  franchise_id: string | null;
  audi: string | null;
  seat: string | null;
  date: string;
  ticket_cost: number | null;
  convenience_fee: number | null;
  fnb_cost: number | null;
  other_expenses: number | null;
  passport_savings: number | null;
  tmdb_rating: number | null;
  format_id: string | null;
  theater_id: string | null;
  rewatch_id: string | null;
  release_date: string | null;
}

interface WatchlistRow {
  id: string;
  title: string;
  priority: number | null;
  genres: string[] | null;
  release_date: string | null;
  watched_movie_id: string | null;
}

interface FormatRow {
  id: string;
  name: string;
  weight: number | null;
}

interface TheaterRow {
  id: string;
  name: string;
  city: string | null;
  capabilities: string[] | null;
}

interface TheaterRatingRow {
  theater_id: string;
  audi: string | null;
  sound: number | null;
  seat: number | null;
  screen: number | null;
  cleanliness: number | null;
}

interface RewatchOptionRow {
  id: string;
  value: number | null;
}

interface FormulaConfigRow {
  params: unknown;
}

interface FranchiseRow {
  id: string;
  name: string;
}

function toNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toUserMovies(rows: MovieRow[]): UserMovieForRecommendation[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    rating: row.rating,
    showtime: row.showtime,
    genres: row.genres,
    language: row.language,
    director: row.director,
    castMembers: row.cast_members,
    keywords: row.keywords,
    franchiseId: row.franchise_id,
    audi: row.audi,
    seat: row.seat,
    date: row.date,
    ticketCost: toNumber(row.ticket_cost),
    convenienceFee: toNumber(row.convenience_fee),
    fnbCost: row.fnb_cost,
    otherExpenses: row.other_expenses,
    passportSavings: toNumber(row.passport_savings),
    tmdbRating: row.tmdb_rating,
    formatId: row.format_id,
    theaterId: row.theater_id,
    rewatchId: row.rewatch_id,
    releaseDate: row.release_date,
  }));
}

function toWatchlist(rows: WatchlistRow[]): UserWatchlistItem[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    priority: toNumber(row.priority),
    genres: row.genres,
    releaseDate: row.release_date,
    watchedMovieId: row.watched_movie_id,
  }));
}

function currentIndiaMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(byType.hour || 0) * 60 + Number(byType.minute || 0);
}

function isPastShow(show: PvrShow, today: string): boolean {
  if (show.showDate !== today) return false;
  const match = show.showTime.match(/(\d{1,2}):(\d{2})/);
  if (!match) return false;
  const showMinutes = Number(match[1]) * 60 + Number(match[2]);
  return showMinutes < currentIndiaMinutes();
}

function formatMatches(showFormat: string, selectedFormat: string): boolean {
  if (selectedFormat === "ALL") return true;
  return showFormat.toLowerCase().includes(selectedFormat.toLowerCase());
}

function languageMatches(showLanguage: string | null, selectedLanguage: string): boolean {
  if (selectedLanguage === "ALL") return true;
  if (!showLanguage) return true;
  return showLanguage.toLowerCase().includes(selectedLanguage.toLowerCase());
}

function staleFromCaches(caches: Array<PvrCacheMeta | null>): boolean {
  return caches.some((cache) => Boolean(cache?.stale));
}

function parseFormulaParams(row: FormulaConfigRow | null): FormulaParams | null {
  if (!row || typeof row.params !== "object" || row.params === null) return null;
  return row.params as FormulaParams;
}

function combineMovies<T extends { id: string; title: string }>(movies: T[]): T[] {
  const byKey = new Map<string, T>();

  for (const movie of movies) {
    const key = `${movie.id}:${movie.title.toLowerCase()}`;
    if (!byKey.has(key)) byKey.set(key, movie);
  }

  return Array.from(byKey.values());
}

async function loadRecommendationUserData(): Promise<{
  userData: RecommendationUserData;
  localMode: boolean;
  errorResponse: NextResponse | null;
}> {
  if (canUseLocalSupabaseFallback()) {
    return {
      userData: LOCAL_RECOMMENDATION_USER_DATA,
      localMode: true,
      errorResponse: null,
    };
  }

  if (!hasSupabaseConfig()) {
    return {
      userData: LOCAL_RECOMMENDATION_USER_DATA,
      localMode: false,
      errorResponse: NextResponse.json(
        { error: "Supabase is not configured" },
        { status: 500 }
      ),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      userData: LOCAL_RECOMMENDATION_USER_DATA,
      localMode: false,
      errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const [
    moviesResult,
    watchlistResult,
    formatsResult,
    theatersResult,
    theaterRatingsResult,
    rewatchOptionsResult,
    formulaResult,
    franchisesResult,
  ] = await Promise.all([
    supabase
      .from("movies")
      .select("id,title,rating,showtime,genres,language,director,cast_members,keywords,franchise_id,audi,seat,date,ticket_cost,convenience_fee,fnb_cost,other_expenses,passport_savings,tmdb_rating,format_id,theater_id,rewatch_id,release_date")
      .eq("user_id", user.id),
    supabase
      .from("watchlist")
      .select("id,title,priority,genres,release_date,watched_movie_id")
      .eq("user_id", user.id),
    supabase
      .from("formats")
      .select("id,name,weight")
      .eq("user_id", user.id),
    supabase
      .from("theaters")
      .select("id,name,city,capabilities")
      .eq("user_id", user.id),
    supabase
      .from("theater_ratings")
      .select("theater_id,audi,sound,seat,screen,cleanliness")
      .eq("user_id", user.id),
    supabase
      .from("rewatch_options")
      .select("id,value")
      .eq("user_id", user.id),
    supabase
      .from("formula_configs")
      .select("params")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("franchises")
      .select("id,name")
      .eq("user_id", user.id),
  ]);

  for (const result of [
    moviesResult,
    watchlistResult,
    formatsResult,
    theatersResult,
    theaterRatingsResult,
    rewatchOptionsResult,
    formulaResult,
    franchisesResult,
  ]) {
    if (result.error) throw result.error;
  }

  return {
    userData: {
      movies: toUserMovies((moviesResult.data || []) as unknown as MovieRow[]),
      watchlist: toWatchlist((watchlistResult.data || []) as unknown as WatchlistRow[]),
      formats: ((formatsResult.data || []) as unknown as FormatRow[]).map(
        (row): UserFormatPreference => ({
          id: row.id,
          name: row.name,
          weight: row.weight || 1,
        })
      ),
      theaters: ((theatersResult.data || []) as unknown as TheaterRow[]).map(
        (row): UserTheaterPreference => ({
          id: row.id,
          name: row.name,
          city: row.city,
          capabilities: row.capabilities,
        })
      ),
      theaterRatings: ((theaterRatingsResult.data || []) as unknown as TheaterRatingRow[]).map(
        (row): UserTheaterRating => ({
          theaterId: row.theater_id,
          audi: row.audi,
          sound: row.sound,
          seat: row.seat,
          screen: row.screen,
          cleanliness: row.cleanliness,
        })
      ),
      rewatchOptions: ((rewatchOptionsResult.data || []) as unknown as RewatchOptionRow[]).map(
        (row): UserRewatchOption => ({
          id: row.id,
          value: row.value || 0,
        })
      ),
      franchises: ((franchisesResult.data || []) as unknown as FranchiseRow[]).map(
        (row): UserFranchise => ({
          id: row.id,
          name: row.name,
        })
      ),
      formulaParams: parseFormulaParams(
        (formulaResult.data || null) as unknown as FormulaConfigRow | null
      ),
    },
    localMode: false,
    errorResponse: null,
  };
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

    const response: PvrRecommendationsResponse = {
      city,
      date,
      generatedAt: new Date().toISOString(),
      recommendations,
      upcoming: enrichedComingSoonMovies.slice(0, 20),
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
