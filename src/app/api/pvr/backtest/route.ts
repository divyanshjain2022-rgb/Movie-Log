import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import {
  buildPersonalPredictionModel,
  predictMoviePersonalFit,
} from "@/lib/pvr/personal-predictor";
import type {
  PvrMovie,
  RecommendationUserData,
  UserMovieForRecommendation,
  UserFranchise,
} from "@/lib/pvr/types";

const MIN_TRAINING_SIZE = 8;

interface BacktestRow {
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

function toNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function rowToUserMovie(row: BacktestRow): UserMovieForRecommendation {
  return {
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
  };
}

/**
 * Convert a user movie into a PvrMovie shape so predictMoviePersonalFit can process it.
 */
function userMovieToPvrMovie(movie: UserMovieForRecommendation): PvrMovie {
  return {
    id: movie.id,
    title: movie.title,
    releaseDate: movie.releaseDate,
    languages: movie.language ? [movie.language] : [],
    genres: movie.genres || [],
    director: movie.director,
    cast: movie.castMembers,
    keywords: movie.keywords,
    tmdbRating: movie.tmdbRating,
    tmdbVoteCount: null,
    posterUrl: null,
    redirectUrl: "",
    source: "pvr",
  };
}

interface BacktestResult {
  index: number;
  title: string;
  date: string;
  actual: number;
  predicted: number;
  error: number;
  absError: number;
  confidence: number;
  confidenceLabel: string;
  reasons: string[];
  trainingSize: number;
}

export async function GET() {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load all user data
  const [moviesResult, formatsResult, theatersResult, theaterRatingsResult, rewatchResult, watchlistResult, franchisesResult] =
    await Promise.all([
      supabase
        .from("movies")
        .select("id,title,rating,showtime,genres,language,director,cast_members,keywords,franchise_id,audi,seat,date,ticket_cost,convenience_fee,fnb_cost,other_expenses,passport_savings,tmdb_rating,format_id,theater_id,rewatch_id,release_date")
        .eq("user_id", user.id)
        .order("date", { ascending: true }),
      supabase.from("formats").select("id,name,weight").eq("user_id", user.id),
      supabase.from("theaters").select("id,name,city,capabilities").eq("user_id", user.id),
      supabase.from("theater_ratings").select("theater_id,audi,sound,seat,screen,cleanliness").eq("user_id", user.id),
      supabase.from("rewatch_options").select("id,value").eq("user_id", user.id),
      supabase.from("watchlist").select("id,title,priority,genres,release_date,watched_movie_id").eq("user_id", user.id),
      supabase.from("franchises").select("id,name").eq("user_id", user.id),
    ]);

  for (const r of [moviesResult, formatsResult, theatersResult, theaterRatingsResult, rewatchResult, watchlistResult, franchisesResult]) {
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  }

  const allRows = (moviesResult.data || []) as unknown as BacktestRow[];
  const allMovies = allRows.map(rowToUserMovie);
  const ratedMovies = allMovies.filter((m) => typeof m.rating === "number" && m.rating > 0);

  // Sort chronologically
  ratedMovies.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const formats = (formatsResult.data || []).map((r: { id: string; name: string; weight?: number | null }) => ({
    id: r.id,
    name: r.name,
    weight: r.weight || 1,
  }));
  const theaters = (theatersResult.data || []).map((r: { id: string; name: string; city?: string | null; capabilities?: string[] | null }) => ({
    id: r.id,
    name: r.name,
    city: r.city || null,
    capabilities: r.capabilities || null,
  }));
  const theaterRatings = (theaterRatingsResult.data || []).map((r: { theater_id: string; audi?: string | null; sound?: number | null; seat?: number | null; screen?: number | null; cleanliness?: number | null }) => ({
    theaterId: r.theater_id,
    audi: r.audi || null,
    sound: r.sound ?? null,
    seat: r.seat ?? null,
    screen: r.screen ?? null,
    cleanliness: r.cleanliness ?? null,
  }));
  const rewatchOptions = (rewatchResult.data || []).map((r: { id: string; value?: number | null }) => ({
    id: r.id,
    value: r.value || 0,
  }));
  const watchlist = (watchlistResult.data || []).map((r: { id: string; title: string; priority?: number | null; genres?: string[] | null; release_date?: string | null; watched_movie_id?: string | null }) => ({
    id: r.id,
    title: r.title,
    priority: r.priority || 0,
    genres: r.genres || null,
    releaseDate: r.release_date || null,
    watchedMovieId: r.watched_movie_id || null,
  }));
  const franchises: UserFranchise[] = (franchisesResult.data || []).map((r: { id: string; name: string }) => ({
    id: r.id,
    name: r.name,
  }));

  // Walk-forward backtest
  const results: BacktestResult[] = [];

  for (let i = MIN_TRAINING_SIZE; i < ratedMovies.length; i++) {
    const trainingSet = ratedMovies.slice(0, i);
    const testMovie = ratedMovies[i];

    const userData: RecommendationUserData = {
      movies: trainingSet,
      watchlist,
      formats,
      theaters,
      theaterRatings,
      rewatchOptions,
      franchises,
      formulaParams: null,
    };

    const model = buildPersonalPredictionModel(userData);
    const pvrMovie = userMovieToPvrMovie(testMovie);
    const fit = predictMoviePersonalFit(pvrMovie, model);

    // Skip if the engine marks this as "already watched" (shouldn't happen since we excluded it)
    if (fit.excluded) continue;

    const actual = testMovie.rating as number;
    const predicted = fit.predictedRating;
    const error = predicted - actual;

    results.push({
      index: i,
      title: testMovie.title,
      date: testMovie.date,
      actual,
      predicted,
      error,
      absError: Math.abs(error),
      confidence: fit.confidence,
      confidenceLabel: fit.confidenceLabel,
      reasons: fit.reasons,
      trainingSize: trainingSet.length,
    });
  }

  // Aggregate metrics
  const n = results.length;
  const mae = n > 0 ? results.reduce((s, r) => s + r.absError, 0) / n : 0;
  const mse = n > 0 ? results.reduce((s, r) => s + r.error * r.error, 0) / n : 0;
  const rmse = Math.sqrt(mse);
  const meanError = n > 0 ? results.reduce((s, r) => s + r.error, 0) / n : 0;
  const within05 = results.filter((r) => r.absError <= 0.5).length;
  const within10 = results.filter((r) => r.absError <= 1.0).length;
  const worstOverpredict = results.reduce((worst, r) => (r.error > worst.error ? r : worst), results[0]);
  const worstUnderpredict = results.reduce((worst, r) => (r.error < worst.error ? r : worst), results[0]);

  // Data coverage diagnostics
  const withKeywords = allMovies.filter((m) => m.keywords && m.keywords.length > 0);
  const withCast = allMovies.filter((m) => m.castMembers && m.castMembers.length > 0);
  const withFranchise = allMovies.filter((m) => m.franchiseId);
  const withDirector = allMovies.filter((m) => m.director);
  const withTmdb = allMovies.filter((m) => typeof m.tmdbRating === "number" && m.tmdbRating > 0);

  // Keyword frequency across all movies
  const keywordCounts = new Map<string, { count: number; avgRating: number; sumRating: number }>();
  for (const movie of allMovies) {
    if (!movie.keywords || !movie.rating) continue;
    for (const kw of movie.keywords) {
      const current = keywordCounts.get(kw) || { count: 0, avgRating: 0, sumRating: 0 };
      current.count += 1;
      current.sumRating += movie.rating;
      current.avgRating = current.sumRating / current.count;
      keywordCounts.set(kw, current);
    }
  }
  const topKeywords = [...keywordCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([kw, stats]) => ({
      keyword: kw,
      movies: stats.count,
      avgRating: Math.round(stats.avgRating * 10) / 10,
    }));

  // Movies missing keywords
  const missingKeywords = allMovies
    .filter((m) => !m.keywords || m.keywords.length === 0)
    .map((m) => m.title);

  return NextResponse.json({
    summary: {
      totalMovies: ratedMovies.length,
      tested: n,
      trainingStart: MIN_TRAINING_SIZE,
      mae: Math.round(mae * 100) / 100,
      rmse: Math.round(rmse * 100) / 100,
      meanBias: Math.round(meanError * 100) / 100,
      within05: `${within05}/${n} (${Math.round((within05 / n) * 100)}%)`,
      within10: `${within10}/${n} (${Math.round((within10 / n) * 100)}%)`,
      worstOverpredict: worstOverpredict
        ? { title: worstOverpredict.title, predicted: worstOverpredict.predicted, actual: worstOverpredict.actual, error: Math.round(worstOverpredict.error * 10) / 10 }
        : null,
      worstUnderpredict: worstUnderpredict
        ? { title: worstUnderpredict.title, predicted: worstUnderpredict.predicted, actual: worstUnderpredict.actual, error: Math.round(worstUnderpredict.error * 10) / 10 }
        : null,
    },
    dataCoverage: {
      total: allMovies.length,
      withKeywords: `${withKeywords.length}/${allMovies.length} (${Math.round((withKeywords.length / allMovies.length) * 100)}%)`,
      withCast: `${withCast.length}/${allMovies.length} (${Math.round((withCast.length / allMovies.length) * 100)}%)`,
      withDirector: `${withDirector.length}/${allMovies.length} (${Math.round((withDirector.length / allMovies.length) * 100)}%)`,
      withFranchise: `${withFranchise.length}/${allMovies.length} (${Math.round((withFranchise.length / allMovies.length) * 100)}%)`,
      withTmdbRating: `${withTmdb.length}/${allMovies.length} (${Math.round((withTmdb.length / allMovies.length) * 100)}%)`,
      topKeywords,
      missingKeywords,
    },
    results: results.map((r) => ({
      ...r,
      error: Math.round(r.error * 100) / 100,
      absError: Math.round(r.absError * 100) / 100,
    })),
  });
}
