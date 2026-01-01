"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Movie, MovieWithRelations, MovieInsert, MovieUpdate, GiftCardUsageEntry } from "@/types";

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

  const createMovie = useCallback(async (movie: MovieInsert, giftCardUsage?: GiftCardUsageEntry[]) => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: insertError } = await supabase
        .from("movies")
        .insert(movie as never)
        .select()
        .single();

      if (insertError) throw insertError;

      // If gift cards were used, save to junction table
      if (giftCardUsage && giftCardUsage.length > 0 && data) {
        const movieGiftCards = giftCardUsage.map(gc => ({
          movie_id: (data as Movie).id,
          gift_card_id: gc.gift_card_id,
          amount_used: gc.amount_used,
        }));

        const { error: gcError } = await supabase
          .from("movie_gift_cards")
          .insert(movieGiftCards as never);

        if (gcError) {
          console.error("Failed to save gift card usage:", gcError);
          // Don't throw - movie was created successfully
        }
      }

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

  const updateMovie = useCallback(async (id: string, updates: MovieUpdate, giftCardUsage?: GiftCardUsageEntry[]) => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: updateError } = await supabase
        .from("movies")
        .update(updates as never)
        .eq("id", id)
        .select()
        .single();

      if (updateError) throw updateError;

      // If gift cards were provided, update them
      if (giftCardUsage !== undefined) {
        // Delete existing gift card associations
        const { error: deleteError } = await supabase
          .from("movie_gift_cards")
          .delete()
          .eq("movie_id", id);

        if (deleteError) {
          console.error("Failed to delete existing gift card usage:", deleteError);
        }

        // Create new associations
        if (giftCardUsage.length > 0) {
          const movieGiftCards = giftCardUsage.map(gc => ({
            movie_id: id,
            gift_card_id: gc.gift_card_id,
            amount_used: gc.amount_used,
          }));

          const { error: gcError } = await supabase
            .from("movie_gift_cards")
            .insert(movieGiftCards as never);

          if (gcError) {
            console.error("Failed to save gift card usage:", gcError);
          }
        }
      }

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
