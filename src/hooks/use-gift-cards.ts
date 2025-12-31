"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { GiftCardWithUsage, GiftCardInsert, GiftCardUpdate, Platform, GiftCard } from "@/types";

export function useGiftCards() {
  const [giftCards, setGiftCards] = useState<GiftCardWithUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchGiftCards = useCallback(async () => {
    try {
      setIsLoading(true);
      const supabase = createClient();

      // Fetch gift cards with platform relation
      const { data: cards, error: cardsError } = await supabase
        .from("gift_cards")
        .select(`
          *,
          platform:platforms(*)
        `)
        .order("expiry_date", { ascending: true });

      if (cardsError) throw cardsError;

      // Fetch movie usage for each card
      const { data: movies, error: moviesError } = await supabase
        .from("movies")
        .select("gc_id, total_cost")
        .not("gc_id", "is", null);

      if (moviesError) throw moviesError;

      // Calculate balance and status for each card
      type CardWithPlatform = GiftCard & { platform: Platform | null };
      const cardsList = (cards || []) as CardWithPlatform[];
      const movieUsage = (movies || []) as Array<{ gc_id: string | null; total_cost: number }>;

      const cardsWithUsage: GiftCardWithUsage[] = cardsList.map((card) => {
        const usedAmount = movieUsage
          .filter((m) => m.gc_id === card.id)
          .reduce((sum, m) => sum + (m.total_cost || 0), 0);

        const balance = card.face_value - usedAmount;
        const isExpired = new Date(card.expiry_date) < new Date();
        const isExhausted = balance <= 0;

        return {
          ...card,
          balance,
          status: isExpired ? "expired" : isExhausted ? "exhausted" : "active",
        } as GiftCardWithUsage;
      });

      setGiftCards(cardsWithUsage);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch gift cards"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGiftCards();
  }, [fetchGiftCards]);

  return { giftCards, isLoading, error, refetch: fetchGiftCards };
}

export function useCreateGiftCard() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createGiftCard = useCallback(async (giftCard: GiftCardInsert) => {
    try {
      setIsLoading(true);
      setError(null);
      const supabase = createClient();

      const { data, error } = await supabase
        .from("gift_cards")
        .insert(giftCard as never)
        .select()
        .single();

      if (error) throw error;
      return data as GiftCard;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to create gift card");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { createGiftCard, isLoading, error };
}

export function useUpdateGiftCard() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateGiftCard = useCallback(async (id: string, updates: GiftCardUpdate) => {
    try {
      setIsLoading(true);
      setError(null);
      const supabase = createClient();

      const { data, error } = await supabase
        .from("gift_cards")
        .update(updates as never)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as GiftCard;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to update gift card");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { updateGiftCard, isLoading, error };
}

export function useDeleteGiftCard() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteGiftCard = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const supabase = createClient();

      const { error } = await supabase.from("gift_cards").delete().eq("id", id);

      if (error) throw error;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to delete gift card");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { deleteGiftCard, isLoading, error };
}
