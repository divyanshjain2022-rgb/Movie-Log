import type { PvrMovie } from "@/lib/pvr/types";

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_REVALIDATE_SECONDS = 60 * 60 * 12;
const DEFAULT_ENRICHMENT_LIMIT = 24;
const ENRICHMENT_CONCURRENCY = 4;

interface TmdbSearchResult {
  id: number;
  title: string;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  poster_path?: string;
}

interface TmdbMovieDetail {
  id: number;
  poster_path?: string;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  credits?: {
    crew?: Array<{
      job?: string;
      name?: string;
    }>;
  };
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getYear(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})/);
  if (!match) return null;
  return Number(match[1]);
}

function titleOverlapScore(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 10;
  if (left.includes(right) || right.includes(left)) return 7;

  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = right.split(" ").filter(Boolean);
  const overlap = rightTokens.filter((token) => leftTokens.has(token)).length;

  if (overlap === 0) return 0;
  return Math.min(6, overlap * 1.6);
}

function scoreSearchMatch(movie: PvrMovie, candidate: TmdbSearchResult): number {
  const movieTitle = normalizeTitle(movie.title);
  const candidateTitle = normalizeTitle(candidate.title || "");
  const titleScore = titleOverlapScore(movieTitle, candidateTitle);
  if (titleScore === 0) return 0;

  const movieYear = getYear(movie.releaseDate);
  const candidateYear = getYear(candidate.release_date);

  let yearScore = 0;
  if (movieYear && candidateYear) {
    const diff = Math.abs(movieYear - candidateYear);
    if (diff === 0) yearScore = 3;
    else if (diff === 1) yearScore = 1.5;
    else if (diff >= 3) yearScore = -2;
  }

  const voteScore = Math.min((candidate.vote_count || 0) / 2500, 1.4);
  return titleScore + yearScore + voteScore;
}

async function fetchTmdbJson<T>(path: string): Promise<T | null> {
  if (!TMDB_API_KEY) return null;

  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(
    `${TMDB_BASE_URL}${path}${separator}api_key=${TMDB_API_KEY}`,
    { next: { revalidate: TMDB_REVALIDATE_SECONDS } }
  );

  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

async function enrichMovie(movie: PvrMovie): Promise<PvrMovie> {
  if (!TMDB_API_KEY) return movie;
  if (movie.tmdbRating && movie.director) return movie;

  const year = getYear(movie.releaseDate);
  const query = encodeURIComponent(movie.title);
  const searchPath = year
    ? `/search/movie?query=${query}&region=IN&include_adult=false&year=${year}`
    : `/search/movie?query=${query}&region=IN&include_adult=false`;

  const searchResponse = await fetchTmdbJson<{ results?: TmdbSearchResult[] }>(searchPath);
  const searchResults = searchResponse?.results || [];
  if (searchResults.length === 0) return movie;

  const bestMatch = [...searchResults]
    .map((candidate) => ({
      candidate,
      score: scoreSearchMatch(movie, candidate),
    }))
    .sort((a, b) => b.score - a.score)[0];

  if (!bestMatch || bestMatch.score < 5) return movie;

  const detail = await fetchTmdbJson<TmdbMovieDetail>(
    `/movie/${bestMatch.candidate.id}?append_to_response=credits`
  );
  if (!detail) {
    return {
      ...movie,
      releaseDate: movie.releaseDate || bestMatch.candidate.release_date || null,
      posterUrl:
        movie.posterUrl ||
        (bestMatch.candidate.poster_path
          ? `https://image.tmdb.org/t/p/w500${bestMatch.candidate.poster_path}`
          : null),
      tmdbRating: movie.tmdbRating ?? bestMatch.candidate.vote_average ?? null,
      tmdbVoteCount: movie.tmdbVoteCount ?? bestMatch.candidate.vote_count ?? null,
    };
  }

  const director =
    detail.credits?.crew?.find((member) => member.job === "Director")?.name || null;

  return {
    ...movie,
    releaseDate:
      movie.releaseDate || detail.release_date || bestMatch.candidate.release_date || null,
    posterUrl:
      movie.posterUrl ||
      (detail.poster_path
        ? `https://image.tmdb.org/t/p/w500${detail.poster_path}`
        : bestMatch.candidate.poster_path
          ? `https://image.tmdb.org/t/p/w500${bestMatch.candidate.poster_path}`
          : null),
    director: movie.director ?? director,
    tmdbRating:
      movie.tmdbRating ??
      detail.vote_average ??
      bestMatch.candidate.vote_average ??
      null,
    tmdbVoteCount:
      movie.tmdbVoteCount ??
      detail.vote_count ??
      bestMatch.candidate.vote_count ??
      null,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker()
    )
  );

  return results;
}

export async function enrichPvrMoviesWithTmdb(
  movies: PvrMovie[],
  limit = DEFAULT_ENRICHMENT_LIMIT
): Promise<PvrMovie[]> {
  if (!TMDB_API_KEY || movies.length === 0) return movies;

  const results = [...movies];
  const candidateIndexes = movies
    .map((movie, index) => ({ movie, index }))
    .filter(({ movie }) => !movie.tmdbRating || !movie.director)
    .slice(0, limit);

  if (candidateIndexes.length === 0) return results;

  const enriched = await mapWithConcurrency(
    candidateIndexes,
    ENRICHMENT_CONCURRENCY,
    async ({ movie }) => {
      try {
        return await enrichMovie(movie);
      } catch {
        return movie;
      }
    }
  );

  enriched.forEach((movie, offset) => {
    const target = candidateIndexes[offset];
    results[target.index] = movie;
  });

  return results;
}
