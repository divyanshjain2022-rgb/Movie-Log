"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Franchise, FranchiseInsert, FranchiseUpdate, MovieWithRelations } from "@/types";

const supabase = createClient();

export function useFranchises() {
  const [franchises, setFranchises] = useState<Franchise[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFranchises = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("franchises")
        .select("*")
        .order("name");

      if (error) throw error;
      setFranchises(data || []);
    } catch (caught) {
      // Runs from an effect: an escaping rejection is unhandled and shows up
      // only as a console exception on the page.
      setError(caught instanceof Error ? caught.message : "Failed to load franchises");
      setFranchises([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFranchises();
  }, [fetchFranchises]);

  return { franchises, isLoading, error, refetch: fetchFranchises };
}

export function useFranchise(id: string) {
  const [franchise, setFranchise] = useState<Franchise | null>(null);
  const [movies, setMovies] = useState<MovieWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        setIsLoading(true);
        const [franchiseRes, moviesRes] = await Promise.all([
          supabase.from("franchises").select("*").eq("id", id).single(),
          supabase
            .from("movies")
            .select(`
              *,
              theater:theaters(*),
              format:formats(*),
              mood:moods(*)
            `)
            .eq("franchise_id", id)
            .order("date"),
        ]);

        if (franchiseRes.error) throw franchiseRes.error;
        setFranchise(franchiseRes.data);
        setMovies(moviesRes.data || []);
      } finally {
        setIsLoading(false);
      }
    }
    if (id) fetch();
  }, [id]);

  return { franchise, movies, isLoading };
}

export function useCreateFranchise() {
  const [isLoading, setIsLoading] = useState(false);

  const createFranchise = useCallback(async (franchise: Omit<FranchiseInsert, "user_id">) => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("franchises")
        .insert({ ...franchise, user_id: user.id } as never)
        .select()
        .single();

      if (error) throw error;
      return data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { createFranchise, isLoading };
}

export function useUpdateFranchise() {
  const [isLoading, setIsLoading] = useState(false);

  const updateFranchise = useCallback(async (id: string, updates: FranchiseUpdate) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("franchises")
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

  return { updateFranchise, isLoading };
}

export function useDeleteFranchise() {
  const [isLoading, setIsLoading] = useState(false);

  const deleteFranchise = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      const { error } = await supabase.from("franchises").delete().eq("id", id);
      if (error) throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { deleteFranchise, isLoading };
}
