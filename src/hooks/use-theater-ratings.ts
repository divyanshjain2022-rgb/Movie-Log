"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TheaterRating, TheaterRatingInsert } from "@/types";

const supabase = createClient();

export function useTheaterRatings(theaterId?: string) {
  const [ratings, setRatings] = useState<TheaterRating[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRatings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      let query = supabase
        .from("theater_ratings")
        .select("*")
        .order("created_at", { ascending: false });

      if (theaterId) {
        query = query.eq("theater_id", theaterId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRatings(data || []);
    } catch (caught) {
      // Runs from an effect: an escaping rejection is unhandled and shows up
      // only as a console exception on the page.
      setError(caught instanceof Error ? caught.message : "Failed to load theater ratings");
      setRatings([]);
    } finally {
      setIsLoading(false);
    }
  }, [theaterId]);

  useEffect(() => {
    fetchRatings();
  }, [fetchRatings]);

  return { ratings, isLoading, error, refetch: fetchRatings };
}

export function useCreateTheaterRating() {
  const [isLoading, setIsLoading] = useState(false);

  const createRating = useCallback(async (rating: Omit<TheaterRatingInsert, "user_id">) => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("theater_ratings")
        .insert({ ...rating, user_id: user.id } as never)
        .select()
        .single();

      if (error) throw error;
      return data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { createRating, isLoading };
}

export function useDeleteTheaterRating() {
  const [isLoading, setIsLoading] = useState(false);

  const deleteRating = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      const { error } = await supabase.from("theater_ratings").delete().eq("id", id);
      if (error) throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { deleteRating, isLoading };
}

// Compute average ratings for a theater
export interface TheaterAvgRatings {
  sound: number;
  seat: number;
  screen: number;
  cleanliness: number;
  overall: number;
  count: number;
}

export function computeTheaterAvgRatings(ratings: TheaterRating[]): TheaterAvgRatings {
  if (ratings.length === 0) {
    return { sound: 0, seat: 0, screen: 0, cleanliness: 0, overall: 0, count: 0 };
  }

  const sum = { sound: 0, seat: 0, screen: 0, cleanliness: 0, count: 0 };
  const counts = { sound: 0, seat: 0, screen: 0, cleanliness: 0 };

  ratings.forEach((r) => {
    if (r.sound) { sum.sound += r.sound; counts.sound++; }
    if (r.seat) { sum.seat += r.seat; counts.seat++; }
    if (r.screen) { sum.screen += r.screen; counts.screen++; }
    if (r.cleanliness) { sum.cleanliness += r.cleanliness; counts.cleanliness++; }
  });

  const avg = {
    sound: counts.sound > 0 ? sum.sound / counts.sound : 0,
    seat: counts.seat > 0 ? sum.seat / counts.seat : 0,
    screen: counts.screen > 0 ? sum.screen / counts.screen : 0,
    cleanliness: counts.cleanliness > 0 ? sum.cleanliness / counts.cleanliness : 0,
    overall: 0,
    count: ratings.length,
  };

  const validAvgs = [avg.sound, avg.seat, avg.screen, avg.cleanliness].filter((v) => v > 0);
  avg.overall = validAvgs.length > 0 ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length : 0;

  return avg;
}
