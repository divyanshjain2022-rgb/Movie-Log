// Shared external-rating fetchers + the crowd blend. Used by the movie-detail
// extras API and the PVR recommendations pipeline.

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const REVALIDATE_SECONDS = 43200;

export interface SourceRating {
  rating: number;
  votes: number | null;
}

export async function fetchImdbRating(imdbId: string): Promise<SourceRating | null> {
  // IMDb's site bot-walls plain fetches, but this static JSONP document
  // endpoint (used by their own embeds) serves ratings without fuss.
  const response = await fetch(
    `https://p.media-imdb.com/static-content/documents/v1/title/${imdbId}/ratings%3Fjsonp=imdb.rating.run:imdb.api.title.ratings/data.json`,
    {
      headers: { "User-Agent": BROWSER_UA },
      next: { revalidate: REVALIDATE_SECONDS },
    }
  );
  if (!response.ok) return null;
  const text = await response.text();
  const match = text.match(/"rating":([\d.]+),"ratingCount":(\d+)/);
  if (!match) return null;
  return { rating: Number(match[1]), votes: Number(match[2]) };
}

export async function fetchLetterboxdRating(tmdbId: string | number): Promise<SourceRating | null> {
  // letterboxd.com/tmdb/{id} redirects to the film page, whose JSON-LD
  // carries the weighted average (0.5-5) and rating count.
  const response = await fetch(`https://letterboxd.com/tmdb/${tmdbId}/`, {
    headers: { "User-Agent": BROWSER_UA },
    redirect: "follow",
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!response.ok) return null;
  const html = await response.text();
  const match = html.match(/"ratingValue":([\d.]+)[\s\S]*?"ratingCount":(\d+)/);
  if (!match) return null;
  return { rating: Number(match[1]), votes: Number(match[2]) };
}

// Vote-weighted blend of ratings already normalised to /10.
export function blendRatings(
  parts: Array<{ value: number; votes: number } | null>
): { rating: number; votes: number } | null {
  const usable = parts.filter(
    (part): part is { value: number; votes: number } => part !== null && part.votes > 0
  );
  const totalVotes = usable.reduce((sum, part) => sum + part.votes, 0);
  if (totalVotes <= 0) return null;
  const rating =
    Math.round(
      (usable.reduce((sum, part) => sum + part.value * part.votes, 0) / totalVotes) * 10
    ) / 10;
  return { rating, votes: totalVotes };
}
