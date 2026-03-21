"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WatchlistItem, WatchlistItemInsert, WatchlistItemUpdate } from "@/types";

const supabase = createClient();

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("watchlist")
        .select("*")
        .order("priority", { ascending: false })
        .order("added_at", { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch watchlist"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return { items, isLoading, error, refetch: fetchItems };
}

export function useCreateWatchlistItem() {
  const [isLoading, setIsLoading] = useState(false);

  const createItem = useCallback(async (item: Omit<WatchlistItemInsert, "user_id">) => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("watchlist")
        .insert({ ...item, user_id: user.id } as never)
        .select()
        .single();

      if (error) throw error;
      return data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { createItem, isLoading };
}

export function useUpdateWatchlistItem() {
  const [isLoading, setIsLoading] = useState(false);

  const updateItem = useCallback(async (id: string, updates: WatchlistItemUpdate) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("watchlist")
        .update(updates as never)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { updateItem, isLoading };
}

export function useDeleteWatchlistItem() {
  const [isLoading, setIsLoading] = useState(false);

  const deleteItem = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      const { error } = await supabase.from("watchlist").delete().eq("id", id);
      if (error) throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { deleteItem, isLoading };
}
