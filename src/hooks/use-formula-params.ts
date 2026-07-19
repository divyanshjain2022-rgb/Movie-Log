"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_FORMULA_PARAMS } from "@/lib/formula";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { FormulaParams } from "@/types";

// The user's active value-formula params. Value-tier labels must be judged
// against the same params the scores were computed with — a custom (flatter)
// exponent config produces a completely different score scale.
export function useFormulaParams(): FormulaParams {
  const [params, setParams] = useState<FormulaParams>(DEFAULT_FORMULA_PARAMS);

  useEffect(() => {
    if (!hasSupabaseConfig()) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("formula_configs")
      .select("params")
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as { params?: FormulaParams } | null;
        if (!cancelled && row?.params) setParams(row.params);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return params;
}
