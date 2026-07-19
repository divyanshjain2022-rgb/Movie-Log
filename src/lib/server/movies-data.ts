import { createClient } from "@/lib/supabase/server";
import type { Format, Mood, Theater } from "@/types";

// Slim movie shape for the list page: what MovieCard renders plus the
// fields applyFilters matches on — no seat_map or unused relations.
export interface ListMovie {
  id: string;
  title: string;
  poster_url: string | null;
  date: string;
  rating: number | null;
  genres: string[] | null;
  language: string | null;
  format_id: string | null;
  theater_id: string | null;
  mood_id: string | null;
  ticket_cost: number;
  convenience_fee: number;
  passport_savings: number;
  fnb_cost: number | null;
  other_expenses: number | null;
  theater: { name: string } | null;
  format: { name: string } | null;
  movie_gift_cards: Array<{
    amount_used: number;
    gift_card: { discount_percent: number | null } | null;
  }>;
}

export interface MoviesListData {
  movies: ListMovie[];
  formats: Format[];
  theaters: Theater[];
  moods: Mood[];
}

const LIST_MOVIE_SELECT = `
  id, title, poster_url, date, rating, genres, language,
  format_id, theater_id, mood_id,
  ticket_cost, convenience_fee, passport_savings, fnb_cost, other_expenses,
  theater:theaters(name),
  format:formats(name),
  movie_gift_cards(amount_used, gift_card:gift_cards(discount_percent))
`;

export async function getMoviesListData(): Promise<MoviesListData> {
  const supabase = await createClient();

  const [movies, formats, theaters, moods] = await Promise.all([
    supabase
      .from("movies")
      .select(LIST_MOVIE_SELECT)
      .order("date", { ascending: false }),
    supabase.from("formats").select("*").order("sort_order").order("name"),
    supabase.from("theaters").select("*").order("name"),
    supabase.from("moods").select("*").order("sort_order").order("name"),
  ]);

  return {
    movies: (movies.data || []) as unknown as ListMovie[],
    formats: (formats.data || []) as Format[],
    theaters: (theaters.data || []) as Theater[],
    moods: (moods.data || []) as Mood[],
  };
}
