import { createClient } from "@/lib/supabase/server";
import type { MovieWithRelations } from "@/types";

// Rewatch sibling rows for the detail page — previously derived by fetching
// the user's ENTIRE movie log with all relations just to filter client-side.
export interface RewatchSibling {
  id: string;
  date: string;
  rating: number | null;
  is_rewatch: boolean;
  original_movie_id: string | null;
  theater: { name: string } | null;
  format: { name: string } | null;
}

export interface MovieDetailData {
  movie: MovieWithRelations | null;
  rewatches: RewatchSibling[];
}

// Same relation set useMovie fetches — the detail page reads broadly,
// including seat_map for the occupancy view, so the full row stays.
const DETAIL_SELECT = `
  *,
  theater:theaters(*),
  format:formats(*),
  mood:moods(*),
  strongest_part:aspects!movies_strongest_part_id_fkey(*),
  weakest_part:aspects!movies_weakest_part_id_fkey(*),
  rewatch:rewatch_options(*),
  gift_card:gift_cards(*),
  movie_gift_cards(*, gift_card:gift_cards(*)),
  franchise:franchises(*),
  movie_companions(id, companion:companions(*))
`;

export async function getMovieDetailData(id: string): Promise<MovieDetailData> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("movies")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  const movie = data as unknown as MovieWithRelations | null;
  if (!movie) return { movie: null, rewatches: [] };

  const originalId = movie.is_rewatch ? movie.original_movie_id : movie.id;
  if (!originalId) return { movie, rewatches: [] };

  const { data: siblings } = await supabase
    .from("movies")
    .select(
      "id, date, rating, is_rewatch, original_movie_id, theater:theaters(name), format:formats(name)"
    )
    .or(`original_movie_id.eq.${originalId},id.eq.${originalId}`)
    .neq("id", movie.id);

  return {
    movie,
    rewatches: (siblings || []) as unknown as RewatchSibling[],
  };
}
