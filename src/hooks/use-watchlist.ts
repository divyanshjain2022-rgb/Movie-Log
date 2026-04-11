"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { canUseLocalSupabaseFallback } from "@/lib/supabase/config";
import type { WatchlistItem, WatchlistItemInsert, WatchlistItemUpdate } from "@/types";

const supabase = createClient();
const LOCAL_WATCHLIST_KEY = "cinemalog-local-watchlist";

function makeLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readLocalWatchlist(): WatchlistItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(LOCAL_WATCHLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as WatchlistItem[] : [];
  } catch {
    return [];
  }
}

function writeLocalWatchlist(items: WatchlistItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_WATCHLIST_KEY, JSON.stringify(items));
}

function makeLocalWatchlistItem(
  item: Omit<WatchlistItemInsert, "user_id">
): WatchlistItem {
  return {
    id: makeLocalId(),
    user_id: "local",
    title: item.title,
    tmdb_id: item.tmdb_id ?? null,
    poster_url: item.poster_url ?? null,
    release_date: item.release_date ?? null,
    genres: item.genres ?? null,
    runtime_minutes: item.runtime_minutes ?? null,
    notes: item.notes ?? null,
    priority: item.priority ?? 0,
    added_at: new Date().toISOString(),
    watched_movie_id: item.watched_movie_id ?? null,
  };
}

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      setIsLoading(true);
      if (canUseLocalSupabaseFallback()) {
        setItems(
          readLocalWatchlist()
            .sort((a, b) => b.added_at.localeCompare(a.added_at))
            .sort((a, b) => b.priority - a.priority)
        );
        return;
      }

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
      if (canUseLocalSupabaseFallback()) {
        const nextItem = makeLocalWatchlistItem(item);
        writeLocalWatchlist([nextItem, ...readLocalWatchlist()]);
        return nextItem;
      }

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
      if (canUseLocalSupabaseFallback()) {
        const items = readLocalWatchlist();
        const nextItems = items.map((item) =>
          item.id === id ? { ...item, ...updates } : item
        );
        writeLocalWatchlist(nextItems);
        const updated = nextItems.find((item) => item.id === id);
        if (!updated) throw new Error("Watchlist item not found");
        return updated;
      }

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
      if (canUseLocalSupabaseFallback()) {
        writeLocalWatchlist(readLocalWatchlist().filter((item) => item.id !== id));
        return;
      }

      const { error } = await supabase.from("watchlist").delete().eq("id", id);
      if (error) throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { deleteItem, isLoading };
}
