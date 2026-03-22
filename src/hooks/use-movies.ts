"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { calculateValueScore, DEFAULT_FORMULA_PARAMS } from "@/lib/formula";
import type { Movie, MovieWithRelations, MovieInsert, MovieUpdate, GiftCardUsageEntry, FormulaParams } from "@/types";

const supabase = createClient();

async function computeValueScore(
  movie: Record<string, any>,
): Promise<number | null> {
  const rating = movie.rating;
  if (!rating || rating <= 0) return null;

  // Get active formula config
  let params: FormulaParams = DEFAULT_FORMULA_PARAMS;
  const { data: formulaConfig } = await supabase
    .from("formula_configs")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  if (formulaConfig) {
    params = (formulaConfig as any).params as FormulaParams;
  }

  // Calculate cost based on use_true_cost setting, subtract passport savings
  let cost = (movie.ticket_cost || 0) + (movie.convenience_fee || 0) - (movie.passport_savings || 0);
  if (params.use_true_cost) {
    cost += (movie.fnb_cost || 0) + (movie.other_expenses || 0);
  }
  if (cost <= 0) return null;

  // Get format weight
  let formatWeight = 1.0;
  if (movie.format_id) {
    const { data: format } = await supabase
      .from("formats")
      .select("*")
      .eq("id", movie.format_id)
      .single();
    if (format) formatWeight = (format as any).weight || 1.0;
  }

  return calculateValueScore(rating, cost, formatWeight, params);
}

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
          gift_card:gift_cards(*),
          movie_gift_cards(*, gift_card:gift_cards(*)),
          franchise:franchises(*),
          movie_companions(id, companion:companions(*))
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
            gift_card:gift_cards(*),
            movie_gift_cards(*, gift_card:gift_cards(*)),
            franchise:franchises(*),
            movie_companions(id, companion:companions(*))
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

      // Get authenticated user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("You must be logged in to create a movie");
      }

      // Set user_id from auth and compute value score
      const valueScore = await computeValueScore(movie);
      const movieWithUser = { ...movie, user_id: user.id, value_score: valueScore };

      const { data, error: insertError } = await supabase
        .from("movies")
        .insert(movieWithUser as never)
        .select()
        .single();

      if (insertError) throw insertError;

      // If gift cards were used, save to junction table
      if (giftCardUsage && giftCardUsage.length > 0 && data) {
        const movieGiftCards = giftCardUsage.map(gc => ({
          movie_id: (data as Movie).id,
          gift_card_id: gc.gift_card_id,
          amount_used: gc.amount_used,
          purpose: gc.purpose || "ticket",
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

      // Recompute value score if rating or cost fields changed
      const hasScoreFields = updates.rating !== undefined || updates.ticket_cost !== undefined ||
        updates.convenience_fee !== undefined || updates.fnb_cost !== undefined ||
        updates.other_expenses !== undefined || updates.format_id !== undefined;

      let updatesWithScore = { ...updates };
      if (hasScoreFields) {
        // Fetch existing movie to merge with updates for score calculation
        const { data: existing } = await supabase.from("movies").select("*").eq("id", id).single();
        if (existing) {
          const merged = { ...(existing as any), ...updates };
          updatesWithScore.value_score = await computeValueScore(merged);
        }
      }

      const { data, error: updateError } = await supabase
        .from("movies")
        .update(updatesWithScore as never)
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
            purpose: gc.purpose || "ticket",
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
