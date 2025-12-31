"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Movie, MovieWithRelations, MovieInsert, MovieUpdate } from "@/types";

const supabase = createClient();

export function useMovies() {
  const [movies, setMovies] = useState<MovieWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchMovies = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("movies")
        .select(`
          *,
          theater:theaters(*),
          format:formats(*),
          mood:moods(*),
          strongest_part:aspects!movies_strongest_part_id_fkey(*),
          weakest_part:aspects!movies_weakest_part_id_fkey(*),
          rewatch:rewatch_options(*),
          gift_card:gift_cards(*)
        `)
        .order("date", { ascending: false });

      if (error) throw error;
      setMovies(data || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch movies"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMovies();
  }, [fetchMovies]);

  return { movies, isLoading, error, refetch: fetchMovies };
}

export function useMovie(id: string) {
  const [movie, setMovie] = useState<MovieWithRelations | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchMovie() {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from("movies")
          .select(`
            *,
            theater:theaters(*),
            format:formats(*),
            mood:moods(*),
            strongest_part:aspects!movies_strongest_part_id_fkey(*),
            weakest_part:aspects!movies_weakest_part_id_fkey(*),
            rewatch:rewatch_options(*),
            gift_card:gift_cards(*)
          `)
          .eq("id", id)
          .single();

        if (error) throw error;
        setMovie(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to fetch movie"));
      } finally {
        setIsLoading(false);
      }
    }

    if (id) {
      fetchMovie();
    }
  }, [id]);

  return { movie, isLoading, error };
}

export function useCreateMovie() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createMovie = useCallback(async (movie: MovieInsert) => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("movies")
        .insert(movie as never)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to create movie");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { createMovie, isLoading, error };
}

export function useUpdateMovie() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateMovie = useCallback(async (id: string, updates: MovieUpdate) => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("movies")
        .update(updates as never)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to update movie");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { updateMovie, isLoading, error };
}

export function useDeleteMovie() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteMovie = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const { error } = await supabase.from("movies").delete().eq("id", id);

      if (error) throw error;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to delete movie");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { deleteMovie, isLoading, error };
}
