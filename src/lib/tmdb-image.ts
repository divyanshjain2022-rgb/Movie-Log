// TMDB serves a poster at a fixed set of widths, chosen by a path segment:
// .../t/p/w500/abc.jpg. Posters are stored at w500 (107 KB for a typical
// poster) but most of the app draws them in boxes 32-73 px wide, so a list of
// 25 movies pulled ~2.7 MB to paint about 130 KB worth of pixels.
//
// Nothing here uses next/image, so there is no optimizer in front of these
// URLs to fix it — the request has to ask for the right size in the first
// place.

export type TmdbWidth = "w92" | "w154" | "w185" | "w342" | "w500";

const TMDB_SIZED = /^(https?:\/\/image\.tmdb\.org\/t\/p\/)(w\d+|original)(\/.+)$/;

/**
 * Re-point a TMDB image URL at a narrower rendition. Anything that is not a
 * sized TMDB URL — a PVR poster, a Supabase storage path, null — is returned
 * untouched, so this is safe to wrap around any poster field.
 *
 * Pick roughly 3x the CSS width of the box it renders in, to cover a phone's
 * device pixel ratio: a 44 px thumbnail wants w154, not w500.
 */
export function tmdbImage<T extends string | null | undefined>(url: T, width: TmdbWidth): T {
  if (!url) return url;
  const match = TMDB_SIZED.exec(url);
  if (!match) return url;
  return `${match[1]}${width}${match[3]}` as T;
}
