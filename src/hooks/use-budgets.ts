"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Budget, BudgetInsert } from "@/types";

const supabase = createClient();

export function useBudgets() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBudgets = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { data, error: queryError } = await supabase
        .from("budgets")
        .select("*")
        .order("year", { ascending: false })
        .order("month", { ascending: false });

      if (queryError) throw queryError;
      setBudgets(data || []);
    } catch (caught) {
      // This runs from an effect, so an escaping rejection is unhandled and
      // only ever showed up as a console exception on the dashboard. Record
      // it instead and let the caller decide whether to say anything.
      setError(caught instanceof Error ? caught.message : "Failed to load budgets");
      setBudgets([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  return { budgets, isLoading, error, refetch: fetchBudgets };
}

export function useBudget(month: number, year: number) {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from("budgets")
          .select("*")
          .eq("month", month)
          .eq("year", year)
          .maybeSingle();

        if (error) throw error;
        setBudget(data);
      } catch {
        // No budget is a legitimate state; a failed read renders the same way.
        setBudget(null);
      } finally {
        setIsLoading(false);
      }
    }
    fetch();
  }, [month, year]);

  return { budget, isLoading };
}

export function useUpsertBudget() {
  const [isLoading, setIsLoading] = useState(false);

  const upsertBudget = useCallback(async (month: number, year: number, amount: number) => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("budgets")
        .upsert(
          { user_id: user.id, month, year, amount } as never,
          { onConflict: "user_id,month,year" }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { upsertBudget, isLoading };
}
