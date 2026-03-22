import type { FormulaParams } from "@/types";

export const DEFAULT_FORMULA_PARAMS: FormulaParams = {
  rating_exponents: {
    tier1: { max_rating: 6, exponent: 1.3 },
    tier2: { max_rating: 7, exponent: 1.4 },
    tier3: { max_rating: 8, exponent: 1.5 },
    tier4: { max_rating: 9, exponent: 1.8 },
    tier5: { max_rating: 10, exponent: 1.9 },
  },
  cost_floor: 100,
  use_true_cost: true,
};

function getExponentForRating(
  rating: number,
  params: FormulaParams
): number {
  const { tier1, tier2, tier3, tier4, tier5 } = params.rating_exponents;

  if (rating <= tier1.max_rating) return tier1.exponent;
  if (rating <= tier2.max_rating) return tier2.exponent;
  if (rating <= tier3.max_rating) return tier3.exponent;
  if (rating <= tier4.max_rating) return tier4.exponent;
  return tier5.exponent;
}

export function calculateValueScore(
  rating: number,
  cost: number,
  formatWeight: number = 1.0,
  params: FormulaParams = DEFAULT_FORMULA_PARAMS
): number {
  if (rating <= 0 || cost <= 0) return 0;

  const exponent = getExponentForRating(rating, params);
  const effectiveCost = Math.max(cost, params.cost_floor);

  // Formula: (rating^exponent * format_weight) / cost * 100
  const score = (Math.pow(rating, exponent) * formatWeight) / effectiveCost * 100;

  return Math.round(score * 10) / 10; // Round to 1 decimal place
}

export function calculateTrueCost(
  totalCost: number,
  gcDiscountPercent: number | null
): number {
  if (!gcDiscountPercent) return totalCost;
  return totalCost * (1 - gcDiscountPercent / 100);
}

/** Compute the effective cost of a movie after passport savings and GC discounts */
export function getEffectiveCost(movie: {
  ticket_cost: number;
  convenience_fee: number;
  fnb_cost?: number | null;
  other_expenses?: number | null;
  passport_savings?: number;
  movie_gift_cards?: Array<{
    amount_used: number;
    gift_card?: { discount_percent?: number } | null;
  }>;
}): number {
  const gross =
    (movie.ticket_cost || 0) +
    (movie.convenience_fee || 0) +
    (movie.fnb_cost || 0) +
    (movie.other_expenses || 0) -
    (movie.passport_savings || 0);

  // Subtract the GC discount portion (amount_used × discount_percent / 100)
  const gcSavings = (movie.movie_gift_cards || []).reduce((sum, mgc) => {
    const discount = mgc.gift_card?.discount_percent || 0;
    return sum + mgc.amount_used * (discount / 100);
  }, 0);

  return Math.max(gross - gcSavings, 0);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatTime(timeString: string): string {
  if (!timeString) return "";

  // If already has AM/PM, just return it (OCR might return "04:00 PM")
  if (/\b(am|pm)\b/i.test(timeString)) {
    return timeString.trim();
  }

  // Handle 24-hour format "HH:MM"
  const match = timeString.match(/(\d{1,2}):(\d{2})/);
  if (!match) return timeString;

  const hour = parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

export function getRatingColor(rating: number): string {
  if (rating >= 8) return "text-positive";
  if (rating >= 6) return "text-gold";
  if (rating >= 4) return "text-muted-foreground";
  return "text-negative";
}

export function getRatingLabel(rating: number): string {
  if (rating >= 9) return "Masterpiece";
  if (rating >= 8) return "Great";
  if (rating >= 7) return "Good";
  if (rating >= 6) return "Decent";
  if (rating >= 5) return "Average";
  if (rating >= 4) return "Below Average";
  if (rating >= 3) return "Poor";
  return "Terrible";
}
