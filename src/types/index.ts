export * from "./database";

// Form types
export interface MovieFormData {
  title: string;
  date: string;
  showtime?: string;
  theater_id?: string;
  audi?: string;
  format_id?: string;
  seat?: string;
  ticket_cost: number;
  convenience_fee: number;
  booking_id?: string;
  tmdb_id?: number;
  runtime_minutes?: number;
  genres?: string[];
  language?: string;
  director?: string;
  poster_url?: string;
  rating?: number;
  mood_id?: string;
  fnb_cost?: number;
  fnb_items?: string;
  strongest_part_id?: string;
  weakest_part_id?: string;
  rewatch_id?: string;
  review?: string;
  remarks?: string;
  gc_id?: string;
  other_expenses?: number;
  passport_savings?: number;
  status?: "upcoming" | "watched";
  gift_cards_used?: Array<{ gift_card_id: string; amount_used: number }>;
  // New fields
  watched_with?: string;
  payment_methods?: Array<{ method: string; amount: number }>;
  // TMDB enrichment
  cast_members?: string[];
  composer?: string;
  cinematographer?: string;
  budget?: number;
  box_office?: number;
  tmdb_rating?: number;
  tmdb_vote_count?: number;
  certification?: string;
  trailer_url?: string;
  keywords?: string[];
  overview?: string;
  release_date?: string;
  // Feature expansion
  franchise_id?: string;
  original_movie_id?: string;
  is_rewatch?: boolean;
  companion_ids?: string[];
  passport_id?: string;
}

export interface FnbFormData {
  date: string;
  theater_id?: string;
  items: string;
  cost: number;
  remarks?: string;
  movie_id?: string;
  gift_cards_used?: Array<{ gift_card_id: string; amount_used: number }>;
}

export interface GiftCardFormData {
  face_value: number;
  amount_paid: number;
  platform_id?: string;
  purchase_date: string;
  expiry_date: string;
  code?: string;
  notes?: string;
}

// OCR Response types
export interface TicketOCRData {
  movie_title: string | null;
  date: string | null;
  showtime: string | null;
  theater: string | null;
  audi: string | null;
  format: string | null;
  seat: string | null;
  ticket_cost: number | null;
  convenience_fee: number | null;
  booking_id: string | null;
  // TMDB Data
  tmdb_id?: number | null;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  original_title?: string | null;
  release_date?: string | null;
}

export interface GiftCardOCRData {
  card_number: string | null;
  pin: string | null;
  face_value: number | null;
  expiry_date: string | null;
  platform: string | null;
}

// TMDB Response type
export interface TMDBMovieData {
  tmdb_id: number;
  title: string;
  runtime_minutes: number;
  genres: string[];
  language: string;
  director: string | null;
  poster_url: string | null;
  release_date: string | null;
  overview: string | null;
  // Enriched fields
  cast_members: string[];
  composer: string | null;
  cinematographer: string | null;
  budget: number | null;
  box_office: number | null;
  tmdb_rating: number | null;
  tmdb_vote_count: number | null;
  certification: string | null;
  trailer_url: string | null;
  keywords: string[];
}

// Dashboard stats
export interface YearStats {
  totalMovies: number;
  totalSpend: number;
  averageRating: number;
  totalSavings: number;
  greatMovies: number;
  mehMovies: number;
}

// Formula config params
export interface FormulaParams {
  rating_exponents: {
    tier1: { max_rating: number; exponent: number };
    tier2: { max_rating: number; exponent: number };
    tier3: { max_rating: number; exponent: number };
    tier4: { max_rating: number; exponent: number };
    tier5: { max_rating: number; exponent: number };
  };
  cost_floor: number;
  use_true_cost: boolean;
}
