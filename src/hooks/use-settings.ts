"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Format, Theater, Mood, Aspect, RewatchOption, Platform, FormulaConfig } from "@/types";

const supabase = createClient();

interface LookupData {
  formats: Format[];
  theaters: Theater[];
  moods: Mood[];
  aspects: Aspect[];
  rewatchOptions: RewatchOption[];
  platforms: Platform[];
  formulaConfig: FormulaConfig | null;
}

export function useLookupData() {
  const [data, setData] = useState<LookupData>({
    formats: [],
    theaters: [],
    moods: [],
    aspects: [],
    rewatchOptions: [],
    platforms: [],
    formulaConfig: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);

      const [
        formatsRes,
        theatersRes,
        moodsRes,
        aspectsRes,
        rewatchRes,
        platformsRes,
        formulaRes,
      ] = await Promise.all([
        supabase.from("formats").select("*").order("sort_order"),
        supabase.from("theaters").select("*").order("name"),
        supabase.from("moods").select("*").order("sort_order"),
        supabase.from("aspects").select("*").order("name"),
        supabase.from("rewatch_options").select("*").order("sort_order"),
        supabase.from("platforms").select("*").order("name"),
        supabase.from("formula_configs").select("*").eq("is_active", true).single(),
      ]);

      if (formatsRes.error) throw formatsRes.error;
      if (theatersRes.error) throw theatersRes.error;
      if (moodsRes.error) throw moodsRes.error;
      if (aspectsRes.error) throw aspectsRes.error;
      if (rewatchRes.error) throw rewatchRes.error;
      if (platformsRes.error) throw platformsRes.error;

      setData({
        formats: formatsRes.data || [],
        theaters: theatersRes.data || [],
        moods: moodsRes.data || [],
        aspects: aspectsRes.data || [],
        rewatchOptions: rewatchRes.data || [],
        platforms: platformsRes.data || [],
        formulaConfig: formulaRes.data || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch lookup data"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { ...data, isLoading, error, refetch: fetchData };
}

// Individual hooks for managing each lookup type

export function useFormats() {
  const [formats, setFormats] = useState<Format[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase.from("formats").select("*").order("sort_order");
      setFormats(data || []);
      setIsLoading(false);
    }
    fetch();
  }, []);

  const addFormat = async (format: Omit<Format, "id">) => {
    const { data, error } = await supabase.from("formats").insert(format as never).select().single();
    if (error) throw error;
    setFormats((prev) => [...prev, data as Format]);
    return data as Format;
  };

  const updateFormat = async (id: string, updates: Partial<Format>) => {
    const { data, error } = await supabase.from("formats").update(updates as never).eq("id", id).select().single();
    if (error) throw error;
    setFormats((prev) => prev.map((f) => (f.id === id ? data as Format : f)));
    return data as Format;
  };

  const deleteFormat = async (id: string) => {
    const { error } = await supabase.from("formats").delete().eq("id", id);
    if (error) throw error;
    setFormats((prev) => prev.filter((f) => f.id !== id));
  };

  return { formats, isLoading, addFormat, updateFormat, deleteFormat };
}

export function useTheaters() {
  const [theaters, setTheaters] = useState<Theater[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase.from("theaters").select("*").order("name");
      setTheaters(data || []);
      setIsLoading(false);
    }
    fetch();
  }, []);

  const addTheater = async (theater: Omit<Theater, "id">) => {
    const { data, error } = await supabase.from("theaters").insert(theater as never).select().single();
    if (error) throw error;
    setTheaters((prev) => [...prev, data as Theater]);
    return data as Theater;
  };

  const updateTheater = async (id: string, updates: Partial<Theater>) => {
    const { data, error } = await supabase.from("theaters").update(updates as never).eq("id", id).select().single();
    if (error) throw error;
    setTheaters((prev) => prev.map((t) => (t.id === id ? data as Theater : t)));
    return data as Theater;
  };

  const deleteTheater = async (id: string) => {
    const { error } = await supabase.from("theaters").delete().eq("id", id);
    if (error) throw error;
    setTheaters((prev) => prev.filter((t) => t.id !== id));
  };

  return { theaters, isLoading, addTheater, updateTheater, deleteTheater };
}
