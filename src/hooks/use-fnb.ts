"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  FnbPurchase,
  FnbPurchaseWithRelations,
  FnbPurchaseInsert,
  FnbPurchaseUpdate,
  GiftCardUsageEntry
} from "@/types";

export function useFnbPurchases() {
  const [fnbPurchases, setFnbPurchases] = useState<FnbPurchaseWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchFnbPurchases = useCallback(async () => {
    try {
      setIsLoading(true);
      const supabase = createClient();

      const { data, error } = await supabase
        .from("fnb_purchases")
        .select(`
          *,
          theater:theaters(*),
          movie:movies(*)
        `)
        .order("date", { ascending: false });

      if (error) throw error;
      setFnbPurchases((data || []) as FnbPurchaseWithRelations[]);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch F&B purchases"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFnbPurchases();
  }, [fetchFnbPurchases]);

  return { fnbPurchases, isLoading, error, refetch: fetchFnbPurchases };
}

export function useFnbPurchase(id: string) {
  const [fnbPurchase, setFnbPurchase] = useState<FnbPurchaseWithRelations | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchFnbPurchase() {
      try {
        setIsLoading(true);
        const supabase = createClient();

        const { data, error } = await supabase
          .from("fnb_purchases")
          .select(`
            *,
            theater:theaters(*),
            movie:movies(*)
          `)
          .eq("id", id)
          .single();

        if (error) throw error;
        setFnbPurchase(data as FnbPurchaseWithRelations);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to fetch F&B purchase"));
      } finally {
        setIsLoading(false);
      }
    }

    if (id) {
      fetchFnbPurchase();
    }
  }, [id]);

  return { fnbPurchase, isLoading, error };
}

export function useCreateFnbPurchase() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createFnbPurchase = useCallback(async (
    fnbPurchase: FnbPurchaseInsert,
    giftCardUsage?: GiftCardUsageEntry[]
  ) => {
    try {
      setIsLoading(true);
      setError(null);
      const supabase = createClient();

      // Get authenticated user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create the F&B purchase
      const { data: insertedData, error: insertError } = await supabase
        .from("fnb_purchases")
        .insert({ ...fnbPurchase, user_id: user.id } as never)
        .select()
        .single();

      if (insertError) throw insertError;

      const data = insertedData as FnbPurchase;

      // If gift cards were used, create the junction records
      if (giftCardUsage && giftCardUsage.length > 0 && data) {
        const fnbGiftCards = giftCardUsage.map(gc => ({
          fnb_purchase_id: data.id,
          gift_card_id: gc.gift_card_id,
          amount_used: gc.amount_used,
        }));

        const { error: gcError } = await supabase
          .from("fnb_gift_cards")
          .insert(fnbGiftCards as never);

        if (gcError) throw gcError;
      }

      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to create F&B purchase");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { createFnbPurchase, isLoading, error };
}

export function useUpdateFnbPurchase() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateFnbPurchase = useCallback(async (
    id: string,
    updates: FnbPurchaseUpdate,
    giftCardUsage?: GiftCardUsageEntry[]
  ) => {
    try {
      setIsLoading(true);
      setError(null);
      const supabase = createClient();

      const { data, error: updateError } = await supabase
        .from("fnb_purchases")
        .update(updates as never)
        .eq("id", id)
        .select()
        .single();

      if (updateError) throw updateError;

      // If gift cards were provided, update them
      if (giftCardUsage !== undefined) {
        // Delete existing gift card associations
        const { error: deleteError } = await supabase
          .from("fnb_gift_cards")
          .delete()
          .eq("fnb_purchase_id", id);

        if (deleteError) throw deleteError;

        // Create new associations
        if (giftCardUsage.length > 0) {
          const fnbGiftCards = giftCardUsage.map(gc => ({
            fnb_purchase_id: id,
            gift_card_id: gc.gift_card_id,
            amount_used: gc.amount_used,
          }));

          const { error: gcError } = await supabase
            .from("fnb_gift_cards")
            .insert(fnbGiftCards as never);

          if (gcError) throw gcError;
        }
      }

      return data as FnbPurchase;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to update F&B purchase");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { updateFnbPurchase, isLoading, error };
}

export function useDeleteFnbPurchase() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteFnbPurchase = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const supabase = createClient();

      // Junction table records will be deleted via ON DELETE CASCADE
      const { error } = await supabase
        .from("fnb_purchases")
        .delete()
        .eq("id", id);

      if (error) throw error;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to delete F&B purchase");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { deleteFnbPurchase, isLoading, error };
}

// Hook to get unlinked F&B purchases (not linked to any movie)
export function useUnlinkedFnbPurchases() {
  const [fnbPurchases, setFnbPurchases] = useState<FnbPurchaseWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUnlinkedFnbPurchases = useCallback(async () => {
    try {
      setIsLoading(true);
      const supabase = createClient();

      const { data, error } = await supabase
        .from("fnb_purchases")
        .select(`
          *,
          theater:theaters(*)
        `)
        .is("movie_id", null)
        .order("date", { ascending: false });

      if (error) throw error;
      setFnbPurchases((data || []) as FnbPurchaseWithRelations[]);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch unlinked F&B purchases"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnlinkedFnbPurchases();
  }, [fetchUnlinkedFnbPurchases]);

  return { fnbPurchases, isLoading, error, refetch: fetchUnlinkedFnbPurchases };
}
