import { NextRequest, NextResponse } from "next/server";
import {
  blendRatings,
  fetchImdbRating,
  fetchLetterboxdRating,
  type SourceRating,
} from "@/lib/crowd-ratings";

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
// External ratings move slowly; half a day of caching keeps us polite.
const REVALIDATE_SECONDS = 43200;

export interface CastMember {
  name: string;
  character: string | null;
  profileUrl: string | null;
}

interface ExtrasResponse {
  cast: CastMember[];
  ratings: {
    imdb: SourceRating | null;
    letterboxd: SourceRating | null;
    rottenTomatoes: { score: number; certified: boolean } | null;
    tmdb: SourceRating | null;
  };
  combined: { rating: number; votes: number } | null;
  imdbId: string | null;
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function fetchRottenTomatoesScore(
  title: string,
  year: number | null
): Promise<{ score: number; certified: boolean } | null> {
  const response = await fetch(
    `https://www.rottentomatoes.com/search?search=${encodeURIComponent(title)}`,
    {
      headers: { "User-Agent": BROWSER_UA },
      next: { revalidate: REVALIDATE_SECONDS },
    }
  );
  if (!response.ok) return null;
  const html = await response.text();

  const wanted = normalizeTitle(title);
  const rows = html.matchAll(
    /<search-page-media-row([^>]*(?:\n[^>]*)*)>([\s\S]*?)<\/search-page-media-row>/g
  );

  let fallback: { score: number; certified: boolean } | null = null;
  for (const row of rows) {
    const attrs = row[1];
    const body = row[2];
    const scoreMatch = attrs.match(/tomatometer-score="(\d+)"/);
    if (!scoreMatch) continue;
    const certified = /tomatometer-is-certified="true"/.test(attrs);
    const result = { score: Number(scoreMatch[1]), certified };

    const rowTitle = body.match(/slot="title"[^>]*>\s*([^<]+?)\s*</)?.[1] || "";
    const rowYear = Number(attrs.match(/release-year="(\d+)"/)?.[1] || 0);
    const titleOk = normalizeTitle(rowTitle) === wanted;
    const yearOk = !year || !rowYear || Math.abs(rowYear - year) <= 1;

    if (titleOk && yearOk) return result;
    if (!fallback && titleOk) fallback = result;
  }
  return fallback;
}

export async function GET(request: NextRequest) {
  if (!TMDB_API_KEY) {
    return NextResponse.json({ error: "TMDB_API_KEY not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const tmdbId = searchParams.get("id");
  if (!tmdbId || !/^\d+$/.test(tmdbId)) {
    return NextResponse.json({ error: "Missing or invalid TMDB id" }, { status: 400 });
  }

  try {
    const detailResponse = await fetch(
      `${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits,external_ids`,
      { next: { revalidate: REVALIDATE_SECONDS } }
    );
    if (!detailResponse.ok) {
      return NextResponse.json({ error: "Movie not found on TMDB" }, { status: 404 });
    }
    const movie = await detailResponse.json();

    const cast: CastMember[] = (movie.credits?.cast || [])
      .slice(0, 12)
      .map((member: { name?: string; character?: string; profile_path?: string }) => ({
        name: member.name || "",
        character: member.character || null,
        profileUrl: member.profile_path
          ? `https://image.tmdb.org/t/p/w342${member.profile_path}`
          : null,
      }))
      .filter((member: CastMember) => member.name);

    const imdbId: string | null = movie.external_ids?.imdb_id || null;
    const year = movie.release_date ? Number(movie.release_date.slice(0, 4)) : null;

    const [imdb, letterboxd, rottenTomatoes] = await Promise.all([
      imdbId ? fetchImdbRating(imdbId).catch(() => null) : Promise.resolve(null),
      fetchLetterboxdRating(tmdbId).catch(() => null),
      fetchRottenTomatoesScore(movie.title || "", year).catch(() => null),
    ]);

    const tmdb: SourceRating | null =
      movie.vote_average > 0
        ? { rating: Math.round(movie.vote_average * 10) / 10, votes: movie.vote_count || null }
        : null;

    // Voter-weighted blend, everything normalised to /10 (Letterboxd is /5).
    const combined = blendRatings([
      imdb ? { value: imdb.rating, votes: imdb.votes || 0 } : null,
      letterboxd ? { value: letterboxd.rating * 2, votes: letterboxd.votes || 0 } : null,
      tmdb ? { value: tmdb.rating, votes: tmdb.votes || 0 } : null,
    ]);

    const payload: ExtrasResponse = {
      cast,
      ratings: { imdb, letterboxd, rottenTomatoes, tmdb },
      combined,
      imdbId,
    };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load extras" },
      { status: 500 }
    );
  }
}
