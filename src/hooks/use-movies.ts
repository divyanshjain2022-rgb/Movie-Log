"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { calculateValueScore, DEFAULT_FORMULA_PARAMS } from "@/lib/formula";
import { watchlistItemMatchesMovie } from "@/lib/watchlist";
import type { Movie, MovieWithRelations, MovieInsert, MovieUpdate, GiftCardUsageEntry, FormulaParams } from "@/types";

const supabase = createClient();

type ScoreMovieFields = {
  rating?: number | null;
  ticket_cost?: number | null;
  convenience_fee?: number | null;
  fnb_cost?: number | null;
  other_expenses?: number | null;
  passport_savings?: number | null;
  format_id?: string | null;
};

type FormulaConfigForScore = {
  params: FormulaParams;
};

type GiftCardUsageForScore = {
  amount_used: number;
  gift_card: { discount_percent: number | null } | null;
};

type FormatForScore = {
  weight: number | null;
};

type WatchlistForSync = {
  id: string;
  title: string;
  tmdb_id: number | null;
  release_date: string | null;
  watched_movie_id: string | null;
};

function toError(err: unknown, fallback: string) {
  if (err instanceof Error) return err;

  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof err.message === "string"
  ) {
    return new Error(err.message);
  }

  return new Error(fallback);
}

async function computeValueScore(
  movie: ScoreMovieFields,
  movieId?: string,
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
  const formulaConfigRow = formulaConfig as FormulaConfigForScore | null;
  if (formulaConfigRow) {
    params = formulaConfigRow.params;
  }

  // Calculate cost based on use_true_cost setting, subtract passport savings
  let cost = (movie.ticket_cost || 0) + (movie.convenience_fee || 0) - (movie.passport_savings || 0);
  if (params.use_true_cost) {
    cost += (movie.fnb_cost || 0) + (movie.other_expenses || 0);
  }

  // Subtract GC discount savings if movie already exists
  if (movieId) {
    const { data: gcUsage } = await supabase
      .from("movie_gift_cards")
      .select("amount_used, purpose, gift_card:gift_cards(discount_percent)")
      .eq("movie_id", movieId);
    const giftCardUsageRows = gcUsage as unknown as Array<GiftCardUsageForScore & { purpose?: string | null }> | null;
    if (giftCardUsageRows) {
      // GC savings must match the cost basis: with true cost off, only the
      // ticket-purpose usage counts (an F&B gift card can't discount a cost
      // that never included F&B — that used to drive cost to zero/negative).
      const gcSavings = giftCardUsageRows
        .filter((mgc) => params.use_true_cost || (mgc.purpose || "ticket") === "ticket")
        .reduce((sum, mgc) => {
          const discount = mgc.gift_card?.discount_percent || 0;
          return sum + mgc.amount_used * (discount / 100);
        }, 0);
      cost -= gcSavings;
    }
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
    const formatRow = format as FormatForScore | null;
    if (formatRow) formatWeight = formatRow.weight || 1.0;
  }

  return calculateValueScore(rating, cost, formatWeight, params);
}

async function syncMatchingWatchlistItems(userId: string, movie: Movie): Promise<void> {
  if (movie.status !== "watched") return;

  const { data, error } = await supabase
    .from("watchlist")
    .select("id,title,tmdb_id,release_date,watched_movie_id")
    .eq("user_id", userId)
    .is("watched_movie_id", null);

  if (error) throw error;

  const items = (data || []) as WatchlistForSync[];
  const matchedIds = items
    .filter((item) => watchlistItemMatchesMovie(item, movie))
    .map((item) => item.id);

  if (matchedIds.length === 0) return;

  const { error: updateError } = await supabase
    .from("watchlist")
    .update({ watched_movie_id: movie.id } as never)
    .eq("user_id", userId)
    .in("id", matchedIds);

  if (updateError) throw updateError;
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

export function useMovie(id: string, initial?: MovieWithRelations | null) {
  const [movie, setMovie] = useState<MovieWithRelations | null>(initial ?? null);
  const [isLoading, setIsLoading] = useState(!initial);
  const [error, setError] = useState<Error | null>(null);

  const fetchMovie = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) {
        setIsLoading(true);
      }
      setError(null);
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
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  }, [id]);

  useEffect(() => {
    // Server-provided data covers the initial render (and updates when the
    // route re-renders with fresh params); fetch only when there is none.
    if (initial !== undefined) {
      setMovie(initial ?? null);
      setIsLoading(false);
      return;
    }
    if (id) {
      fetchMovie();
    }
  }, [id, fetchMovie, initial]);

  return { movie, isLoading, error, refetch: fetchMovie };
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

      // Set user_id from auth and compute initial value score (without GC discount)
      const valueScore = await computeValueScore(movie);
      const movieWithUser = { ...movie, user_id: user.id, value_score: valueScore };

      const { data, error: insertError } = await supabase
        .from("movies")
        .insert(movieWithUser as never)
        .select()
        .single();

      if (insertError) throw insertError;

      const createdMovie = data as Movie;

      // If gift cards were used, save to junction table
      if (giftCardUsage && giftCardUsage.length > 0 && data) {
        const movieGiftCards = giftCardUsage.map(gc => ({
          movie_id: createdMovie.id,
          gift_card_id: gc.gift_card_id,
          amount_used: gc.amount_used,
          purpose: gc.purpose || "ticket",
        }));

        const { error: gcError } = await supabase
          .from("movie_gift_cards")
          .insert(movieGiftCards as never);

        if (gcError) {
          console.error("Failed to save gift card usage:", gcError);
        } else {
          // Recompute value score now that GC usage is saved
          const updatedScore = await computeValueScore(movie, createdMovie.id);
          if (updatedScore !== valueScore) {
            await supabase.from("movies").update({ value_score: updatedScore } as never).eq("id", createdMovie.id);
          }
        }
      }

      try {
        await syncMatchingWatchlistItems(user.id, createdMovie);
      } catch (watchlistError) {
        console.error("Failed to sync matching watchlist items:", watchlistError);
      }

      return createdMovie;
    } catch (err) {
      const error = toError(err, "Failed to create movie");
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

      // Replace gift card associations FIRST — the value score reads GC
      // discounts from the junction table, so writing the score before the
      // rows exist bakes in stale savings.
      if (giftCardUsage !== undefined) {
        const { error: deleteError } = await supabase
          .from("movie_gift_cards")
          .delete()
          .eq("movie_id", id);

        if (deleteError) {
          console.error("Failed to delete existing gift card usage:", deleteError);
        }

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

      // Recompute value score if rating, cost fields, or gift cards changed
      const hasScoreFields = updates.rating !== undefined || updates.ticket_cost !== undefined ||
        updates.convenience_fee !== undefined || updates.fnb_cost !== undefined ||
        updates.other_expenses !== undefined || updates.format_id !== undefined ||
        updates.passport_savings !== undefined || giftCardUsage !== undefined;

      const updatesWithScore = { ...updates };
      if (hasScoreFields) {
        // Fetch existing movie to merge with updates for score calculation
        const { data: existing } = await supabase.from("movies").select("*").eq("id", id).single();
        const existingMovie = existing as Movie | null;
        if (existingMovie) {
          const merged = { ...existingMovie, ...updates };
          updatesWithScore.value_score = await computeValueScore(merged, id);
        }
      }

      const { data, error: updateError } = await supabase
        .from("movies")
        .update(updatesWithScore as never)
        .eq("id", id)
        .select()
        .single();

      if (updateError) throw updateError;

      return data;
    } catch (err) {
      const error = toError(err, "Failed to update movie");
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
      const error = toError(err, "Failed to delete movie");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { deleteMovie, isLoading, error };
}
