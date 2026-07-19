import { createClient } from "@/lib/supabase/server";

// Slim movie shape for the stats page: every field its aggregations read,
// and nothing else — the full rows with seat_map made this the heaviest
// payload in the app for ~20 rendered numbers.
export interface StatsMovie {
  id: string;
  title: string;
  date: string;
  showtime: string | null;
  seat: string | null;
  ticket_cost: number;
  fnb_cost: number | null;
  other_expenses: number | null;
  passport_savings: number;
  total_cost: number;
  value_score: number | null;
  rating: number | null;
  runtime_minutes: number | null;
  genres: string[] | null;
  language: string | null;
  director: string | null;
  release_date: string | null;
  tmdb_rating: number | null;
  occupancy: number | null;
  theater: { name: string } | null;
  format: { name: string } | null;
  movie_gift_cards: Array<{
    amount_used: number;
    gift_card: { discount_percent: number | null } | null;
  }>;
}

const STATS_MOVIE_SELECT = `
  id, title, date, showtime, seat,
  ticket_cost, fnb_cost, other_expenses, passport_savings, total_cost, value_score,
  rating, runtime_minutes, genres, language, director, release_date, tmdb_rating, occupancy,
  theater:theaters(name),
  format:formats(name),
  movie_gift_cards(amount_used, gift_card:gift_cards(discount_percent))
`;

export async function getStatsMovies(): Promise<StatsMovie[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("movies")
    .select(STATS_MOVIE_SELECT)
    .order("date", { ascending: false });
  return (data || []) as unknown as StatsMovie[];
}
