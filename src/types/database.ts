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
          created_at: string;
        };
        Insert: {
          id?: string;
          movie_id: string;
          gift_card_id: string;
          amount_used: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          movie_id?: string;
          gift_card_id?: string;
          amount_used?: number;
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
          sort_order: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          weight?: number;
          sort_order?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          weight?: number;
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

// Extended types with relations
export interface MovieWithRelations extends Movie {
  theater?: Theater | null;
  format?: Format | null;
  mood?: Mood | null;
  strongest_part?: Aspect | null;
  weakest_part?: Aspect | null;
  rewatch?: RewatchOption | null;
  gift_card?: GiftCard | null;
  // Multi-GC support via junction table
  movie_gift_cards?: Array<{
    id: string;
    amount_used: number;
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
}
