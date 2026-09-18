import { blendRatings } from "@/lib/crowd-ratings";
import type { ExternalRatings } from "@/types";

export interface CrowdMovie {
  id: string;
  title: string;
  rating: number | null;
  tmdb_rating: number | null;
  tmdb_vote_count: number | null;
  external_ratings: ExternalRatings | null;
}

export interface CrowdPick {
  id: string;
  title: string;
  yours: number;
  crowd: number;
}

export interface CrowdComparison {
  count: number;
  // Your rating minus the crowd's, averaged: positive means you rate higher.
  averageDiff: number;
  // How far your ratings sit from each site's, closest first.
  sources: Array<{ name: string; gap: number }>;
  likedMore: CrowdPick[];
  likedLess: CrowdPick[];
}

const MIN_MOVIES = 5;
const NOTABLE_DIFF = 1;

// Same figure as "Crowd" on the movie page: IMDb, Letterboxd (out of 5, so
// doubled) and TMDB, weighted by votes.
export function crowdRating(movie: CrowdMovie): number | null {
  const ext = movie.external_ratings;
  const blend = blendRatings([
    ext?.imdb ? { value: ext.imdb.rating, votes: ext.imdb.votes || 0 } : null,
    ext?.letterboxd ? { value: ext.letterboxd.rating * 2, votes: ext.letterboxd.votes || 0 } : null,
    movie.tmdb_rating ? { value: movie.tmdb_rating, votes: movie.tmdb_vote_count || 0 } : null,
  ]);
  return blend?.rating ?? null;
}

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

export function compareWithCrowd(movies: CrowdMovie[]): CrowdComparison | null {
  const rows = movies.flatMap((movie) => {
    const ext = movie.external_ratings;
    if (!movie.rating || !ext || !(ext.imdb || ext.letterboxd)) return [];
    const crowd = crowdRating(movie);
    return crowd === null ? [] : [{ id: movie.id, title: movie.title, yours: movie.rating, crowd, ext }];
  });
  if (rows.length < MIN_MOVIES) return null;

  const sourceGap = (name: string, pick: (ext: ExternalRatings) => number | null) => {
    const gaps = rows.flatMap((row) => {
      const value = pick(row.ext);
      return value === null ? [] : [Math.abs(row.yours - value)];
    });
    return gaps.length > 0 ? { name, gap: mean(gaps) } : null;
  };
  const picks: CrowdPick[] = rows.map(({ id, title, yours, crowd }) => ({ id, title, yours, crowd }));

  return {
    count: rows.length,
    averageDiff: mean(rows.map((row) => row.yours - row.crowd)),
    sources: [
      sourceGap("IMDb", (ext) => ext.imdb?.rating ?? null),
      sourceGap("Letterboxd", (ext) => (ext.letterboxd ? ext.letterboxd.rating * 2 : null)),
    ]
      .filter((source): source is { name: string; gap: number } => source !== null)
      .sort((a, b) => a.gap - b.gap),
    likedMore: picks
      .filter((p) => p.yours - p.crowd >= NOTABLE_DIFF)
      .sort((a, b) => b.yours - b.crowd - (a.yours - a.crowd))
      .slice(0, 3),
    likedLess: picks
      .filter((p) => p.crowd - p.yours >= NOTABLE_DIFF)
      .sort((a, b) => b.crowd - b.yours - (a.crowd - a.yours))
      .slice(0, 3),
  };
}
