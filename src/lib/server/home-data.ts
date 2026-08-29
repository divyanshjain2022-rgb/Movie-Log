import { createClient } from "@/lib/supabase/server";
import type { GiftCard, GiftCardWithUsage, Platform } from "@/types";

// Slim movie shape for the dashboard: exactly what the summary stats,
// budget bar, and RecentMovies cards read — no seat_map, no unused joins.
export interface HomeMovie {
  id: string;
  title: string;
  poster_url: string | null;
  date: string;
  rating: number | null;
  runtime_minutes: number | null;
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

export interface HomeData {
  /**
   * The moment this payload was built, from the server clock. Anything
   * date-derived in the client tree renders from this instead of reading the
   * clock during render, which would disagree between the server HTML and
   * hydration and drift on every re-render.
   */
  now: number;
  movies: HomeMovie[];
  giftCards: GiftCardWithUsage[];
  pendingWatchlistCount: number;
  currentBudgetAmount: number | null;
  passportCostTotal: number;
}

const HOME_MOVIE_SELECT = `
  id, title, poster_url, date, rating, runtime_minutes,
  ticket_cost, convenience_fee, passport_savings, fnb_cost, other_expenses,
  theater:theaters(name),
  format:formats(name),
  movie_gift_cards(amount_used, gift_card:gift_cards(discount_percent))
`;

type UsageRow = { gift_card_id: string; amount_used: number };

export function withUsage(
  cards: Array<GiftCard & { platform: Platform | null }>,
  movieUsage: UsageRow[],
  fnbUsage: UsageRow[]
): GiftCardWithUsage[] {
  const used = new Map<string, number>();
  for (const u of [...movieUsage, ...fnbUsage]) {
    used.set(u.gift_card_id, (used.get(u.gift_card_id) || 0) + (u.amount_used || 0));
  }
  return cards.map((card) => {
    const balance = card.face_value - (used.get(card.id) || 0);
    const isExpired = new Date(card.expiry_date) < new Date();
    return {
      ...card,
      balance: Math.max(balance, 0),
      status: isExpired ? "expired" : balance <= 0 ? "exhausted" : "active",
    } as GiftCardWithUsage;
  });
}

export async function getHomeData(): Promise<HomeData> {
  const supabase = await createClient();
  const now = new Date();

  const [movies, cards, movieUsage, fnbUsage, watchlist, budget, passports] =
    await Promise.all([
      supabase
        .from("movies")
        .select(HOME_MOVIE_SELECT)
        .order("date", { ascending: false }),
      supabase
        .from("gift_cards")
        .select("*, platform:platforms(*)")
        .order("expiry_date", { ascending: true }),
      supabase.from("movie_gift_cards").select("gift_card_id, amount_used"),
      supabase.from("fnb_gift_cards").select("gift_card_id, amount_used"),
      supabase
        .from("watchlist")
        .select("id", { count: "exact", head: true })
        .is("watched_movie_id", null),
      supabase
        .from("budgets")
        .select("amount")
        .eq("month", now.getMonth() + 1)
        .eq("year", now.getFullYear())
        .maybeSingle(),
      supabase.from("passports").select("amount_paid"),
    ]);

  return {
    now: now.getTime(),
    movies: (movies.data || []) as unknown as HomeMovie[],
    giftCards: withUsage(
      (cards.data || []) as Array<GiftCard & { platform: Platform | null }>,
      (movieUsage.data || []) as UsageRow[],
      (fnbUsage.data || []) as UsageRow[]
    ),
    pendingWatchlistCount: watchlist.count || 0,
    currentBudgetAmount:
      (budget.data as { amount: number } | null)?.amount ?? null,
    passportCostTotal: ((passports.data || []) as Array<{ amount_paid: number | null }>).reduce(
      (sum, p) => sum + (p.amount_paid || 0),
      0
    ),
  };
}
