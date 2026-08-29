import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canUseLocalSupabaseFallback, hasSupabaseConfig } from "@/lib/supabase/config";
import { LOCAL_RECOMMENDATION_USER_DATA } from "@/lib/pvr/local-user-data";
import type {
  PvrShow,
  RecommendationUserData,
  UserDismissal,
  UserFranchise,
  UserFormatPreference,
  UserMovieForRecommendation,
  UserRewatchOption,
  UserTheaterPreference,
  UserTheaterRating,
  UserWatchlistItem,
} from "@/lib/pvr/types";
import type { FormulaParams } from "@/types";

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

function parseFormulaParams(row: FormulaConfigRow | null): FormulaParams | null {
  if (!row || typeof row.params !== "object" || row.params === null) return null;
  return row.params as FormulaParams;
}

export function currentIndiaMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(byType.hour || 0) * 60 + Number(byType.minute || 0);
}

export function isPastShow(show: PvrShow, today: string): boolean {
  if (show.showDate !== today) return false;
  const match = show.showTime.match(/(\d{1,2}):(\d{2})/);
  if (!match) return false;
  const showMinutes = Number(match[1]) * 60 + Number(match[2]);
  return showMinutes < currentIndiaMinutes();
}

export function formatMatches(showFormat: string, selectedFormat: string): boolean {
  if (selectedFormat === "ALL") return true;
  return showFormat.toLowerCase().includes(selectedFormat.toLowerCase());
}

export function languageMatches(showLanguage: string | null, selectedLanguage: string): boolean {
  if (selectedLanguage === "ALL") return true;
  if (!showLanguage) return true;
  return showLanguage.toLowerCase().includes(selectedLanguage.toLowerCase());
}

export async function loadRecommendationUserData(botUserId?: string): Promise<{
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

  // Bot path (Telegram cron/webhook): the caller has already verified the bot
  // secret and resolved the single user's id; use a service-role client.
  let supabase: Awaited<ReturnType<typeof createClient>>;
  let resolvedUserId: string;
  if (botUserId && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient: createServiceClient } = await import("@supabase/supabase-js");
    supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    ) as unknown as Awaited<ReturnType<typeof createClient>>;
    resolvedUserId = botUserId;
  } else {
    supabase = await createClient();
    // Locally verified against the JWKS instead of a round trip to the Auth
    // server — this sits in front of the slowest page in the app, so the
    // request it saves is the one the user is already waiting on. `sub` is
    // the user id.
    const { data: claims, error: authError } = await supabase.auth.getClaims();
    const subject = claims?.claims?.sub;

    if (authError || !subject) {
      return {
        userData: LOCAL_RECOMMENDATION_USER_DATA,
        localMode: false,
        errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }
    resolvedUserId = subject;
  }
  const user = { id: resolvedUserId };

  const [
    moviesResult,
    watchlistResult,
    formatsResult,
    theatersResult,
    theaterRatingsResult,
    rewatchOptionsResult,
    formulaResult,
    franchisesResult,
    dismissalsResult,
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
    supabase
      .from("movie_dismissals")
      .select("id,movie_title,pvr_movie_id,reason,reason_detail")
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
    // dismissalsResult errors are non-fatal (table may not exist yet)
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
      dismissals: ((dismissalsResult.data || []) as unknown as Array<{ id: string; movie_title: string; pvr_movie_id: string; reason: string; reason_detail: string | null }>).map(
        (row): UserDismissal => ({
          id: row.id,
          movieTitle: row.movie_title,
          pvrMovieId: row.pvr_movie_id,
          reason: row.reason as UserDismissal["reason"],
          reasonDetail: row.reason_detail,
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
