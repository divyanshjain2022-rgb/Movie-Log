import type { FormulaParams } from "@/types";

export type PvrSource = "pvr";

export interface PvrCacheMeta {
  cached: boolean;
  stale: boolean;
  fetchedAt: string;
  ttlSeconds: number;
}

export interface PvrFetchResult<T> {
  data: T;
  cache: PvrCacheMeta;
}

export interface PvrPriceRange {
  min: number | null;
  max: number | null;
  values: number[];
}

export interface PvrMovie {
  id: string;
  title: string;
  releaseDate: string | null;
  languages: string[];
  genres: string[];
  posterUrl: string | null;
  redirectUrl: string;
  source: PvrSource;
}

export interface PvrShow {
  showKey: string;
  movieId: string;
  movieTitle: string;
  city: string;
  cinemaName: string;
  cinemaId: string | null;
  screenId: string | null;
  screenName: string | null;
  showDate: string;
  showTime: string;
  format: string;
  language: string | null;
  encrypted: string | null;
  totalSeats: number | null;
  availableSeats: number | null;
  priceRange: PvrPriceRange;
  redirectUrl: string;
}

export interface PvrSeatCategory {
  code: string;
  description: string;
  price: number;
  totalSeats: number;
  availableSeats: number;
  soldSeats: number;
  qualityWeight: number;
}

export interface PvrSeatQuote {
  showKey: string;
  categories: PvrSeatCategory[];
  recommendedCategory: PvrSeatCategory | null;
  minPrice: number | null;
  maxPrice: number | null;
  availableSeatCount: number;
}

export interface UserMovieForRecommendation {
  id: string;
  title: string;
  rating: number | null;
  genres: string[] | null;
  language: string | null;
  director: string | null;
  castMembers: string[] | null;
  date: string;
  ticketCost: number;
  convenienceFee: number;
  fnbCost: number | null;
  otherExpenses: number | null;
  passportSavings: number;
  formatId: string | null;
  theaterId: string | null;
  rewatchId: string | null;
  releaseDate: string | null;
}

export interface UserWatchlistItem {
  id: string;
  title: string;
  priority: number;
  genres: string[] | null;
  releaseDate: string | null;
  watchedMovieId: string | null;
}

export interface UserFormatPreference {
  id: string;
  name: string;
  weight: number;
}

export interface UserTheaterPreference {
  id: string;
  name: string;
  city: string | null;
  capabilities: string[] | null;
}

export interface UserTheaterRating {
  theaterId: string;
  audi: string | null;
  sound: number | null;
  seat: number | null;
  screen: number | null;
  cleanliness: number | null;
}

export interface UserRewatchOption {
  id: string;
  value: number;
}

export interface RecommendationUserData {
  movies: UserMovieForRecommendation[];
  watchlist: UserWatchlistItem[];
  formats: UserFormatPreference[];
  theaters: UserTheaterPreference[];
  theaterRatings: UserTheaterRating[];
  rewatchOptions: UserRewatchOption[];
  formulaParams: FormulaParams | null;
}

export interface MovieFitResult {
  predictedRating: number;
  reasons: string[];
  excluded: boolean;
}

export interface PriceAdvice {
  bestValueClass: string | null;
  targetPrice: string;
  upgradeAdvice: string | null;
}

export interface RecommendationOption {
  show: PvrShow;
  score: number;
  valueScore: number;
  exactPrice: boolean;
  displayPrice: number | null;
  targetPrice: number | null;
  recommendedCategory: PvrSeatCategory | null;
  priceAdvice: PriceAdvice;
  formatAdvice: string;
  timingAdvice: string;
  availabilityLabel: string;
  needsExactPrice: boolean;
}

export interface MovieRecommendation {
  movie: PvrMovie;
  predictedRating: number;
  reasons: string[];
  options: RecommendationOption[];
  bestOption: RecommendationOption;
}

export interface PvrRecommendationsResponse {
  city: string;
  date: string;
  generatedAt: string;
  recommendations: MovieRecommendation[];
  upcoming: PvrMovie[];
  otherPlaying: PvrMovie[];
  diagnostics: {
    pvrMovieCount: number;
    candidateMovieCount: number;
    fetchedSessionMovieCount: number;
    showCount: number;
    exactSeatQuoteCount: number;
    stale: boolean;
    localMode: boolean;
    errors: string[];
  };
  cache: {
    comingSoon: PvrCacheMeta | null;
    search: PvrCacheMeta | null;
    sessions: PvrCacheMeta[];
    seatLayouts: PvrCacheMeta[];
  };
}
