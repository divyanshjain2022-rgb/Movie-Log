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

      // Fetch usage from movie_gift_cards junction table
      const { data: movieUsage, error: movieUsageError } = await supabase
        .from("movie_gift_cards")
        .select("gift_card_id, amount_used");

      if (movieUsageError) throw movieUsageError;

      // Fetch usage from fnb_gift_cards junction table
      const { data: fnbUsage, error: fnbUsageError } = await supabase
        .from("fnb_gift_cards")
        .select("gift_card_id, amount_used");

      if (fnbUsageError) throw fnbUsageError;

      // Calculate balance and status for each card using both junction tables
      type CardWithPlatform = GiftCard & { platform: Platform | null };
      const cardsList = (cards || []) as CardWithPlatform[];
      const movieUsageList = (movieUsage || []) as Array<{ gift_card_id: string; amount_used: number }>;
      const fnbUsageList = (fnbUsage || []) as Array<{ gift_card_id: string; amount_used: number }>;

      const cardsWithUsage: GiftCardWithUsage[] = cardsList.map((card) => {
        const movieUsedAmount = movieUsageList
          .filter((u) => u.gift_card_id === card.id)
          .reduce((sum, u) => sum + (u.amount_used || 0), 0);

        const fnbUsedAmount = fnbUsageList
          .filter((u) => u.gift_card_id === card.id)
          .reduce((sum, u) => sum + (u.amount_used || 0), 0);

        const totalUsed = movieUsedAmount + fnbUsedAmount;
        const balance = card.face_value - totalUsed;
        const isExpired = new Date(card.expiry_date) < new Date();
        const isExhausted = balance <= 0;

        return {
          ...card,
          balance: Math.max(balance, 0),
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

      // Get authenticated user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("You must be logged in to add a gift card");
      }

      const { data, error } = await supabase
        .from("gift_cards")
        .insert({ ...giftCard, user_id: user.id } as never)
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
