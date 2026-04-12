"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Aspect,
  Format,
  Mood,
  Platform,
  RewatchOption,
  Theater,
} from "@/types";

const supabase = createClient();

interface LookupState {
  formats: Format[];
  theaters: Theater[];
  moods: Mood[];
  aspects: Aspect[];
  rewatchOptions: RewatchOption[];
  platforms: Platform[];
}

const EMPTY_LOOKUPS: LookupState = {
  formats: [],
  theaters: [],
  moods: [],
  aspects: [],
  rewatchOptions: [],
  platforms: [],
};

function toError(err: unknown, fallback: string) {
  if (err instanceof Error) return err;
  return new Error(fallback);
}

export function useLookupData() {
  const [data, setData] = useState<LookupState>(EMPTY_LOOKUPS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLookupData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [
        formatsResult,
        theatersResult,
        moodsResult,
        aspectsResult,
        rewatchResult,
        platformsResult,
      ] = await Promise.all([
        supabase.from("formats").select("*").order("sort_order").order("name"),
        supabase.from("theaters").select("*").order("name"),
        supabase.from("moods").select("*").order("sort_order").order("name"),
        supabase.from("aspects").select("*").order("category").order("name"),
        supabase.from("rewatch_options").select("*").order("sort_order").order("name"),
        supabase.from("platforms").select("*").order("name"),
      ]);

      for (const result of [
        formatsResult,
        theatersResult,
        moodsResult,
        aspectsResult,
        rewatchResult,
        platformsResult,
      ]) {
        if (result.error) throw result.error;
      }

      setData({
        formats: (formatsResult.data || []) as Format[],
        theaters: (theatersResult.data || []) as Theater[],
        moods: (moodsResult.data || []) as Mood[],
        aspects: (aspectsResult.data || []) as Aspect[],
        rewatchOptions: (rewatchResult.data || []) as RewatchOption[],
        platforms: (platformsResult.data || []) as Platform[],
      });
    } catch (err) {
      setError(toError(err, "Failed to load lookup data"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLookupData();
  }, [fetchLookupData]);

  return {
    ...data,
    isLoading,
    error,
    refetch: fetchLookupData,
  };
}

export function useFormats() {
  const [formats, setFormats] = useState<Format[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchFormats = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("formats")
        .select("*")
        .order("sort_order")
        .order("name");

      if (error) throw error;
      setFormats((data || []) as Format[]);
    } catch (err) {
      setError(toError(err, "Failed to load formats"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFormats();
  }, [fetchFormats]);

  const addFormat = useCallback(async (format: Omit<Format, "id">) => {
    const { data, error } = await supabase
      .from("formats")
      .insert(format as never)
      .select()
      .single();

    if (error) throw error;
    const created = data as Format;
    setFormats((current) =>
      [...current, created].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    );
    return created;
  }, []);

  const updateFormat = useCallback(async (id: string, updates: Partial<Format>) => {
    const { data, error } = await supabase
      .from("formats")
      .update(updates as never)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    const updated = data as Format;
    setFormats((current) =>
      current
        .map((format) => (format.id === id ? updated : format))
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    );
    return updated;
  }, []);

  const deleteFormat = useCallback(async (id: string) => {
    const { error } = await supabase.from("formats").delete().eq("id", id);
    if (error) throw error;
    setFormats((current) => current.filter((format) => format.id !== id));
  }, []);

  return {
    formats,
    isLoading,
    error,
    refetch: fetchFormats,
    addFormat,
    updateFormat,
    deleteFormat,
  };
}

export function useTheaters() {
  const [theaters, setTheaters] = useState<Theater[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTheaters = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("theaters")
        .select("*")
        .order("name");

      if (error) throw error;
      setTheaters((data || []) as Theater[]);
    } catch (err) {
      setError(toError(err, "Failed to load theaters"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTheaters();
  }, [fetchTheaters]);

  const addTheater = useCallback(async (theater: Omit<Theater, "id">) => {
    const { data, error } = await supabase
      .from("theaters")
      .insert(theater as never)
      .select()
      .single();

    if (error) throw error;
    const created = data as Theater;
    setTheaters((current) =>
      [...current, created].sort((a, b) => a.name.localeCompare(b.name))
    );
    return created;
  }, []);

  const updateTheater = useCallback(async (id: string, updates: Partial<Theater>) => {
    const { data, error } = await supabase
      .from("theaters")
      .update(updates as never)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    const updated = data as Theater;
    setTheaters((current) =>
      current
        .map((theater) => (theater.id === id ? updated : theater))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    return updated;
  }, []);

  const deleteTheater = useCallback(async (id: string) => {
    const { error } = await supabase.from("theaters").delete().eq("id", id);
    if (error) throw error;
    setTheaters((current) => current.filter((theater) => theater.id !== id));
  }, []);

  return {
    theaters,
    isLoading,
    error,
    refetch: fetchTheaters,
    addTheater,
    updateTheater,
    deleteTheater,
  };
}
