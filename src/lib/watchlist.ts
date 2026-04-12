import type { MovieInsert, MovieWithRelations, WatchlistItem } from "@/types";

type WatchlistLike = Pick<WatchlistItem, "title" | "tmdb_id" | "release_date">;
type MovieLike = Pick<MovieWithRelations, "title" | "tmdb_id" | "release_date">;
type MovieInsertLike = Pick<MovieInsert, "title" | "tmdb_id" | "release_date">;

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getYear(value: string | null | undefined): string | null {
  if (!value) return null;
  const year = value.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

export function titlesRoughlyMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizeTitle(left);
  const normalizedRight = normalizeTitle(right);

  if (!normalizedLeft || !normalizedRight) return false;
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
}

export function watchlistItemMatchesMovie(
  item: WatchlistLike,
  movie: MovieLike | MovieInsertLike
): boolean {
  if (item.tmdb_id && movie.tmdb_id) {
    return item.tmdb_id === movie.tmdb_id;
  }

  if (!titlesRoughlyMatch(item.title, movie.title)) {
    return false;
  }

  const itemYear = getYear(item.release_date);
  const movieYear = getYear(movie.release_date);

  if (itemYear && movieYear && itemYear !== movieYear) {
    return false;
  }

  return true;
}
