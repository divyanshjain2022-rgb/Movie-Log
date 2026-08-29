"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Passport, PassportInsert, PassportUpdate, PassportWithUsage } from "@/types";

const supabase = createClient();

export function usePassports() {
  const [passports, setPassports] = useState<PassportWithUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPassports = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch all passports
      const { data: passportData, error: passportError } = await supabase
        .from("passports")
        .select("*")
        .order("purchase_date", { ascending: false });

      if (passportError) throw passportError;

      // Fetch movies that used passports (have passport_savings > 0 and passport_id set)
      const { data: moviesData } = await supabase
        .from("movies")
        .select("id, passport_id, passport_savings")
        .gt("passport_savings", 0);

      // Exactly the three columns selected above.
      type PassportUsageRow = {
        id: string;
        passport_id: string | null;
        passport_savings: number | null;
      };
      const movies = (moviesData || []) as unknown as PassportUsageRow[];

      // Compute usage stats per passport
      const enriched: PassportWithUsage[] = (passportData || []).map((p: Passport) => {
        const linkedMovies = movies.filter((m) => m.passport_id === p.id);
        const totalSavings = linkedMovies.reduce((sum, m) => sum + (m.passport_savings || 0), 0);

        return {
          ...p,
          uses_count: linkedMovies.length,
          total_savings: totalSavings,
          net_savings: totalSavings - p.amount_paid,
        };
      });

      setPassports(enriched);
    } catch (caught) {
      // Called from an effect: rethrowing here surfaced only as an unhandled
      // rejection in the console on the dashboard.
      setError(caught instanceof Error ? caught.message : "Failed to load passports");
      setPassports([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPassports();
  }, [fetchPassports]);

  return { passports, isLoading, error, refetch: fetchPassports };
}

export function useCreatePassport() {
  const [isLoading, setIsLoading] = useState(false);

  const createPassport = useCallback(async (passport: Omit<PassportInsert, "user_id">) => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("passports")
        .insert({ ...passport, user_id: user.id } as never)
        .select()
        .single();

      if (error) throw error;
      return data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { createPassport, isLoading };
}

export function useUpdatePassport() {
  const [isLoading, setIsLoading] = useState(false);

  const updatePassport = useCallback(async (id: string, updates: PassportUpdate) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("passports")
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

  return { updatePassport, isLoading };
}

export function useDeletePassport() {
  const [isLoading, setIsLoading] = useState(false);

  const deletePassport = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      const { error } = await supabase.from("passports").delete().eq("id", id);
      if (error) throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { deletePassport, isLoading };
}
