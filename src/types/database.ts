export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Payment method entry for tracking how a movie was paid for
export interface PaymentMethodEntry {
  method: string;
  amount: number;
}

export const PAYMENT_METHODS = [
  "UPI",
  "Credit Card",
  "Debit Card",
  "Cash",
  "PVR Wallet",
  "Net Banking",
  "Other",
] as const;

export interface Database {
  public: {
    Tables: {
      movies: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          user_id: string;
          title: string;
          date: string;
          showtime: string | null;
          theater_id: string | null;
          audi: string | null;
          format_id: string | null;
          seat: string | null;
          ticket_cost: number;
          convenience_fee: number;
          booking_id: string | null;
          tmdb_id: number | null;
          runtime_minutes: number | null;
          genres: string[] | null;
          language: string | null;
          director: string | null;
          poster_url: string | null;
          rating: number | null;
          mood_id: string | null;
          fnb_cost: number | null;
          fnb_items: string | null;
          strongest_part_id: string | null;
          weakest_part_id: string | null;
          rewatch_id: string | null;
          review: string | null;
          remarks: string | null;
          gc_id: string | null;
          other_expenses: number | null;
          passport_savings: number;
          total_cost: number;
          value_score: number | null;
          status: "upcoming" | "watched";
          // New fields (migration 002)
          watched_with: string | null;
          payment_methods: PaymentMethodEntry[] | null;
          // TMDB enrichment (migration 003)
          cast_members: string[] | null;
          composer: string | null;
          cinematographer: string | null;
          budget: number | null;
          box_office: number | null;
          tmdb_rating: number | null;
          tmdb_vote_count: number | null;
          certification: string | null;
          trailer_url: string | null;
          keywords: string[] | null;
          overview: string | null;
          release_date: string | null;
          // Feature expansion (migration 004)
          franchise_id: string | null;
          original_movie_id: string | null;
          is_rewatch: boolean;
          // Passport (migration 006)
          passport_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          user_id: string;
          title: string;
          date: string;
          showtime?: string | null;
          theater_id?: string | null;
          audi?: string | null;
          format_id?: string | null;
          seat?: string | null;
          ticket_cost?: number;
          convenience_fee?: number;
          booking_id?: string | null;
          tmdb_id?: number | null;
          runtime_minutes?: number | null;
          genres?: string[] | null;
          language?: string | null;
          director?: string | null;
          poster_url?: string | null;
          rating?: number | null;
          mood_id?: string | null;
          fnb_cost?: number | null;
          fnb_items?: string | null;
          strongest_part_id?: string | null;
          weakest_part_id?: string | null;
          rewatch_id?: string | null;
          review?: string | null;
          remarks?: string | null;
          gc_id?: string | null;
          other_expenses?: number | null;
          passport_savings?: number;
          value_score?: number | null;
          status?: "upcoming" | "watched";
          watched_with?: string | null;
          payment_methods?: PaymentMethodEntry[] | null;
          cast_members?: string[] | null;
          composer?: string | null;
          cinematographer?: string | null;
          budget?: number | null;
          box_office?: number | null;
          tmdb_rating?: number | null;
          tmdb_vote_count?: number | null;
          certification?: string | null;
          trailer_url?: string | null;
          keywords?: string[] | null;
          overview?: string | null;
          release_date?: string | null;
          franchise_id?: string | null;
          original_movie_id?: string | null;
          is_rewatch?: boolean;
          passport_id?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          user_id?: string;
          title?: string;
          date?: string;
          showtime?: string | null;
          theater_id?: string | null;
          audi?: string | null;
          format_id?: string | null;
          seat?: string | null;
          ticket_cost?: number;
          convenience_fee?: number;
          booking_id?: string | null;
          tmdb_id?: number | null;
          runtime_minutes?: number | null;
          genres?: string[] | null;
          language?: string | null;
          director?: string | null;
          poster_url?: string | null;
          rating?: number | null;
          mood_id?: string | null;
          fnb_cost?: number | null;
          fnb_items?: string | null;
          strongest_part_id?: string | null;
          weakest_part_id?: string | null;
          rewatch_id?: string | null;
          review?: string | null;
          remarks?: string | null;
          gc_id?: string | null;
          other_expenses?: number | null;
          passport_savings?: number;
          value_score?: number | null;
          status?: "upcoming" | "watched";
          watched_with?: string | null;
          payment_methods?: PaymentMethodEntry[] | null;
          cast_members?: string[] | null;
          composer?: string | null;
          cinematographer?: string | null;
          budget?: number | null;
          box_office?: number | null;
          tmdb_rating?: number | null;
          tmdb_vote_count?: number | null;
          certification?: string | null;
          trailer_url?: string | null;
          keywords?: string[] | null;
          overview?: string | null;
          release_date?: string | null;
          franchise_id?: string | null;
          original_movie_id?: string | null;
          is_rewatch?: boolean;
          passport_id?: string | null;
        };
      };
      fnb_purchases: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          user_id: string;
          date: string;
          theater_id: string | null;
          items: string;
          cost: number;
          remarks: string | null;
          movie_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          user_id: string;
          date: string;
          theater_id?: string | null;
          items: string;
          cost: number;
          remarks?: string | null;
          movie_id?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          user_id?: string;
          date?: string;
          theater_id?: string | null;
          items?: string;
          cost?: number;
          remarks?: string | null;
          movie_id?: string | null;
        };
      };
      movie_gift_cards: {
        Row: {
          id: string;
          movie_id: string;
          gift_card_id: string;
          amount_used: number;
          purpose: "ticket" | "fnb";
          created_at: string;
        };
        Insert: {
          id?: string;
          movie_id: string;
          gift_card_id: string;
          amount_used: number;
          purpose?: "ticket" | "fnb";
          created_at?: string;
        };
        Update: {
          id?: string;
          movie_id?: string;
          gift_card_id?: string;
          amount_used?: number;
          purpose?: "ticket" | "fnb";
          created_at?: string;
        };
      };
      fnb_gift_cards: {
        Row: {
          id: string;
          fnb_purchase_id: string;
          gift_card_id: string;
          amount_used: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          fnb_purchase_id: string;
          gift_card_id: string;
          amount_used: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          fnb_purchase_id?: string;
          gift_card_id?: string;
          amount_used?: number;
          created_at?: string;
        };
      };
      gift_cards: {
        Row: {
          id: string;
          created_at: string;
          user_id: string;
          face_value: number;
          amount_paid: number;
          discount_percent: number;
          platform_id: string | null;
          purchase_date: string;
          expiry_date: string;
          code: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          user_id: string;
          face_value: number;
          amount_paid: number;
          platform_id?: string | null;
          purchase_date: string;
          expiry_date: string;
          code?: string | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          user_id?: string;
          face_value?: number;
          amount_paid?: number;
          platform_id?: string | null;
          purchase_date?: string;
          expiry_date?: string;
          code?: string | null;
          notes?: string | null;
        };
      };
      formats: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          weight: number;
          default_audi: string | null;
          sort_order: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          weight?: number;
          default_audi?: string | null;
          sort_order?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          weight?: number;
          default_audi?: string | null;
          sort_order?: number;
        };
      };
      theaters: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          city: string | null;
          has_imax: boolean;
          has_4dx: boolean;
          notes: string | null;
          capabilities: string[] | null;
          default_audi_by_format: Json | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          city?: string | null;
          has_imax?: boolean;
          has_4dx?: boolean;
          notes?: string | null;
          capabilities?: string[] | null;
          default_audi_by_format?: Json | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          city?: string | null;
          has_imax?: boolean;
          has_4dx?: boolean;
          notes?: string | null;
          capabilities?: string[] | null;
          default_audi_by_format?: Json | null;
        };
      };
      moods: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          emoji: string | null;
          sentiment: "positive" | "negative" | "neutral";
          sort_order: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          emoji?: string | null;
          sentiment: "positive" | "negative" | "neutral";
          sort_order?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          emoji?: string | null;
          sentiment?: "positive" | "negative" | "neutral";
          sort_order?: number;
        };
      };
      aspects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          category: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          category?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          category?: string | null;
        };
      };
      rewatch_options: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          value: number;
          sort_order: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          value?: number;
          sort_order?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          value?: number;
          sort_order?: number;
        };
      };
      platforms: {
        Row: {
          id: string;
          user_id: string;
          name: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
        };
      };
      formula_configs: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          params: Json;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          params: Json;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          params?: Json;
          is_active?: boolean;
        };
      };
      watchlist: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          tmdb_id: number | null;
          poster_url: string | null;
          release_date: string | null;
          genres: string[] | null;
          runtime_minutes: number | null;
          notes: string | null;
          priority: number;
          added_at: string;
          watched_movie_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          tmdb_id?: number | null;
          poster_url?: string | null;
          release_date?: string | null;
          genres?: string[] | null;
          runtime_minutes?: number | null;
          notes?: string | null;
          priority?: number;
          added_at?: string;
          watched_movie_id?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          tmdb_id?: number | null;
          poster_url?: string | null;
          release_date?: string | null;
          genres?: string[] | null;
          runtime_minutes?: number | null;
          notes?: string | null;
          priority?: number;
          added_at?: string;
          watched_movie_id?: string | null;
        };
      };
      budgets: {
        Row: {
          id: string;
          user_id: string;
          month: number;
          year: number;
          amount: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          month: number;
          year: number;
          amount: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          month?: number;
          year?: number;
          amount?: number;
        };
      };
      franchises: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          tmdb_collection_id: number | null;
          poster_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          tmdb_collection_id?: number | null;
          poster_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          tmdb_collection_id?: number | null;
          poster_url?: string | null;
          created_at?: string;
        };
      };
      companions: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          avatar_emoji: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          avatar_emoji?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          avatar_emoji?: string;
        };
      };
      movie_companions: {
        Row: {
          id: string;
          movie_id: string;
          companion_id: string;
        };
        Insert: {
          id?: string;
          movie_id: string;
          companion_id: string;
        };
        Update: {
          id?: string;
          movie_id?: string;
          companion_id?: string;
        };
      };
      movie_photos: {
        Row: {
          id: string;
          user_id: string;
          movie_id: string;
          storage_path: string;
          caption: string | null;
          photo_type: "ticket" | "selfie" | "fnb" | "general";
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          movie_id: string;
          storage_path: string;
          caption?: string | null;
          photo_type?: "ticket" | "selfie" | "fnb" | "general";
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          movie_id?: string;
          storage_path?: string;
          caption?: string | null;
          photo_type?: "ticket" | "selfie" | "fnb" | "general";
          created_at?: string;
        };
      };
      theater_ratings: {
        Row: {
          id: string;
          user_id: string;
          theater_id: string;
          audi: string | null;
          sound: number | null;
          seat: number | null;
          screen: number | null;
          cleanliness: number | null;
          notes: string | null;
          movie_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          theater_id: string;
          audi?: string | null;
          sound?: number | null;
          seat?: number | null;
          screen?: number | null;
          cleanliness?: number | null;
          notes?: string | null;
          movie_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          theater_id?: string;
          audi?: string | null;
          sound?: number | null;
          seat?: number | null;
          screen?: number | null;
          cleanliness?: number | null;
          notes?: string | null;
          movie_id?: string | null;
          created_at?: string;
        };
      };
      fnb_items: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          category: "snack" | "beverage" | "combo" | "other";
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          category?: "snack" | "beverage" | "combo" | "other";
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          category?: "snack" | "beverage" | "combo" | "other";
        };
      };
      fnb_purchase_items: {
        Row: {
          id: string;
          fnb_purchase_id: string;
          fnb_item_id: string | null;
          item_name: string;
          quantity: number;
          price: number;
        };
        Insert: {
          id?: string;
          fnb_purchase_id: string;
          fnb_item_id?: string | null;
          item_name: string;
          quantity?: number;
          price?: number;
        };
        Update: {
          id?: string;
          fnb_purchase_id?: string;
          fnb_item_id?: string | null;
          item_name?: string;
          quantity?: number;
          price?: number;
        };
      };
      passports: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          purchase_date: string;
          expiry_date: string | null;
          amount_paid: number;
          total_uses: number;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name?: string;
          purchase_date: string;
          expiry_date?: string | null;
          amount_paid: number;
          total_uses?: number;
          notes?: string | null;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          name?: string;
          purchase_date?: string;
          expiry_date?: string | null;
          amount_paid?: number;
          total_uses?: number;
          notes?: string | null;
          is_active?: boolean;
        };
      };
      movie_dismissals: {
        Row: {
          id: string;
          user_id: string;
          movie_title: string;
          pvr_movie_id: string;
          reason: "language" | "genre" | "director" | "cast" | "story" | "seen_it" | "bad_reviews";
          reason_detail: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          movie_title: string;
          pvr_movie_id: string;
          reason: "language" | "genre" | "director" | "cast" | "story" | "seen_it" | "bad_reviews";
          reason_detail?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          movie_title?: string;
          pvr_movie_id?: string;
          reason?: "language" | "genre" | "director" | "cast" | "story" | "seen_it" | "bad_reviews";
          reason_detail?: string | null;
          created_at?: string;
        };
      };
    };
    Views: object;
    Functions: object;
    Enums: object;
  };
}

// Convenience types
export type Movie = Database["public"]["Tables"]["movies"]["Row"];
export type MovieInsert = Database["public"]["Tables"]["movies"]["Insert"];
export type MovieUpdate = Database["public"]["Tables"]["movies"]["Update"];

export type GiftCard = Database["public"]["Tables"]["gift_cards"]["Row"];
export type GiftCardInsert = Database["public"]["Tables"]["gift_cards"]["Insert"];
export type GiftCardUpdate = Database["public"]["Tables"]["gift_cards"]["Update"];

export type Format = Database["public"]["Tables"]["formats"]["Row"];
export type Theater = Database["public"]["Tables"]["theaters"]["Row"];
export type Mood = Database["public"]["Tables"]["moods"]["Row"];
export type Aspect = Database["public"]["Tables"]["aspects"]["Row"];
export type RewatchOption = Database["public"]["Tables"]["rewatch_options"]["Row"];
export type Platform = Database["public"]["Tables"]["platforms"]["Row"];
export type FormulaConfig = Database["public"]["Tables"]["formula_configs"]["Row"];

// New table types
export type WatchlistItem = Database["public"]["Tables"]["watchlist"]["Row"];
export type WatchlistItemInsert = Database["public"]["Tables"]["watchlist"]["Insert"];
export type WatchlistItemUpdate = Database["public"]["Tables"]["watchlist"]["Update"];

export type Budget = Database["public"]["Tables"]["budgets"]["Row"];
export type BudgetInsert = Database["public"]["Tables"]["budgets"]["Insert"];
export type BudgetUpdate = Database["public"]["Tables"]["budgets"]["Update"];

export type Franchise = Database["public"]["Tables"]["franchises"]["Row"];
export type FranchiseInsert = Database["public"]["Tables"]["franchises"]["Insert"];
export type FranchiseUpdate = Database["public"]["Tables"]["franchises"]["Update"];

export type Companion = Database["public"]["Tables"]["companions"]["Row"];
export type CompanionInsert = Database["public"]["Tables"]["companions"]["Insert"];
export type CompanionUpdate = Database["public"]["Tables"]["companions"]["Update"];

export type MovieCompanion = Database["public"]["Tables"]["movie_companions"]["Row"];
export type MovieCompanionInsert = Database["public"]["Tables"]["movie_companions"]["Insert"];

export type MoviePhoto = Database["public"]["Tables"]["movie_photos"]["Row"];
export type MoviePhotoInsert = Database["public"]["Tables"]["movie_photos"]["Insert"];

export type TheaterRating = Database["public"]["Tables"]["theater_ratings"]["Row"];
export type TheaterRatingInsert = Database["public"]["Tables"]["theater_ratings"]["Insert"];

export type FnbItem = Database["public"]["Tables"]["fnb_items"]["Row"];
export type FnbItemInsert = Database["public"]["Tables"]["fnb_items"]["Insert"];

export type FnbPurchaseItem = Database["public"]["Tables"]["fnb_purchase_items"]["Row"];
export type FnbPurchaseItemInsert = Database["public"]["Tables"]["fnb_purchase_items"]["Insert"];

export type Passport = Database["public"]["Tables"]["passports"]["Row"];
export type PassportInsert = Database["public"]["Tables"]["passports"]["Insert"];
export type PassportUpdate = Database["public"]["Tables"]["passports"]["Update"];

// Passport with computed usage stats
export interface PassportWithUsage extends Passport {
  uses_count: number;
  total_savings: number;
  net_savings: number; // total_savings - amount_paid
}

// Extended types with relations
export interface MovieWithRelations extends Movie {
  theater?: Theater | null;
  format?: Format | null;
  mood?: Mood | null;
  strongest_part?: Aspect | null;
  weakest_part?: Aspect | null;
  rewatch?: RewatchOption | null;
  gift_card?: GiftCard | null;
  franchise?: Franchise | null;
  original_movie?: Movie | null;
  movie_companions?: Array<{ id: string; companion: Companion }>;
  // Multi-GC support via junction table
  movie_gift_cards?: Array<{
    id: string;
    amount_used: number;
    purpose: "ticket" | "fnb";
    gift_card: GiftCard;
  }>;
}

export interface GiftCardWithUsage extends GiftCard {
  balance: number;
  status: "active" | "exhausted" | "expired";
  platform?: Platform | null;
}

// F&B types
export type FnbPurchase = Database["public"]["Tables"]["fnb_purchases"]["Row"];
export type FnbPurchaseInsert = Database["public"]["Tables"]["fnb_purchases"]["Insert"];
export type FnbPurchaseUpdate = Database["public"]["Tables"]["fnb_purchases"]["Update"];

export type MovieGiftCard = Database["public"]["Tables"]["movie_gift_cards"]["Row"];
export type MovieGiftCardInsert = Database["public"]["Tables"]["movie_gift_cards"]["Insert"];

export type FnbGiftCard = Database["public"]["Tables"]["fnb_gift_cards"]["Row"];
export type FnbGiftCardInsert = Database["public"]["Tables"]["fnb_gift_cards"]["Insert"];

// Extended F&B type with relations
export interface FnbPurchaseWithRelations extends FnbPurchase {
  theater?: Theater | null;
  movie?: Movie | null;
  gift_cards?: Array<{
    gift_card: GiftCardWithUsage;
    amount_used: number;
  }>;
}

// Gift card usage entry
export interface GiftCardUsageEntry {
  gift_card_id: string;
  amount_used: number;
  purpose?: "ticket" | "fnb";
}

export type MovieDismissal = Database["public"]["Tables"]["movie_dismissals"]["Row"];
export type MovieDismissalInsert = Database["public"]["Tables"]["movie_dismissals"]["Insert"];
