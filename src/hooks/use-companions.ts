"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Companion, CompanionInsert, CompanionUpdate } from "@/types";

const supabase = createClient();

export function useCompanions() {
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCompanions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("companions")
        .select("*")
        .order("name");

      if (error) throw error;
      setCompanions(data || []);
    } catch (caught) {
      // Runs from an effect: an escaping rejection is unhandled and shows up
      // only as a console exception on the page.
      setError(caught instanceof Error ? caught.message : "Failed to load companions");
      setCompanions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanions();
  }, [fetchCompanions]);

  return { companions, isLoading, error, refetch: fetchCompanions };
}

export function useCreateCompanion() {
  const [isLoading, setIsLoading] = useState(false);

  const createCompanion = useCallback(async (name: string, avatar_emoji?: string) => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("companions")
        .insert({ user_id: user.id, name, avatar_emoji: avatar_emoji || "🧑" } as never)
        .select()
        .single();

      if (error) throw error;
      return data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { createCompanion, isLoading };
}

export function useUpdateCompanion() {
  const [isLoading, setIsLoading] = useState(false);

  const updateCompanion = useCallback(async (id: string, updates: CompanionUpdate) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("companions")
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

  return { updateCompanion, isLoading };
}

export function useDeleteCompanion() {
  const [isLoading, setIsLoading] = useState(false);

  const deleteCompanion = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      const { error } = await supabase.from("companions").delete().eq("id", id);
      if (error) throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { deleteCompanion, isLoading };
}

// Movie-companion junction management
export function useMovieCompanions(movieId: string) {
  const [companionIds, setCompanionIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from("movie_companions")
          .select("companion_id")
          .eq("movie_id", movieId);

        if (error) throw error;
        setCompanionIds((data || []).map((d: { companion_id: string }) => d.companion_id));
      } finally {
        setIsLoading(false);
      }
    }
    if (movieId) fetch();
  }, [movieId]);

  return { companionIds, isLoading };
}

export function useSyncMovieCompanions() {
  const syncCompanions = useCallback(async (movieId: string, companionIds: string[]) => {
    // Delete existing
    await supabase.from("movie_companions").delete().eq("movie_id", movieId);

    // Insert new
    if (companionIds.length > 0) {
      const rows = companionIds.map((cid) => ({
        movie_id: movieId,
        companion_id: cid,
      }));
      const { error } = await supabase
        .from("movie_companions")
        .insert(rows as never);
      if (error) throw error;
    }
  }, []);

  return { syncCompanions };
}

// Companion stats
export interface CompanionStats {
  companion: Companion;
  movieCount: number;
  avgRating: number;
  topTheater: string | null;
}

export function useCompanionStats(movies: Array<{ id: string; rating?: number | null; theater?: { name: string } | null; movie_companions?: Array<{ companion: Companion }> }>) {
  const statsMap = new Map<string, CompanionStats>();

  movies.forEach((movie) => {
    (movie.movie_companions || []).forEach(({ companion }) => {
      if (!statsMap.has(companion.id)) {
        statsMap.set(companion.id, {
          companion,
          movieCount: 0,
          avgRating: 0,
          topTheater: null,
        });
      }
      const s = statsMap.get(companion.id)!;
      s.movieCount++;
      if (movie.rating) {
        s.avgRating = (s.avgRating * (s.movieCount - 1) + movie.rating) / s.movieCount;
      }
    });
  });

  // Compute top theater per companion
  movies.forEach((movie) => {
    (movie.movie_companions || []).forEach(({ companion }) => {
      const s = statsMap.get(companion.id);
      if (s && movie.theater?.name) {
        // Simple: just set last theater (for proper mode, would need counting)
        s.topTheater = movie.theater.name;
      }
    });
  });

  return Array.from(statsMap.values()).sort((a, b) => b.movieCount - a.movieCount);
}
