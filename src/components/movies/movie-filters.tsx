"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import type { MovieWithRelations, Format, Theater, Mood } from "@/types";

export interface MovieFilters {
  genres: string[];
  ratingMin: number;
  ratingMax: number;
  theaterId: string;
  formatId: string;
  dateFrom: string;
  dateTo: string;
  moodId: string;
  language: string;
}

const DEFAULT_FILTERS: MovieFilters = {
  genres: [],
  ratingMin: 0,
  ratingMax: 10,
  theaterId: "",
  formatId: "",
  dateFrom: "",
  dateTo: "",
  moodId: "",
  language: "",
};

interface MovieFiltersProps {
  movies: MovieWithRelations[];
  formats: Format[];
  theaters: Theater[];
  moods: Mood[];
  filters: MovieFilters;
  onFiltersChange: (filters: MovieFilters) => void;
  children: React.ReactNode; // trigger button
}

export function MovieFiltersSheet({
  movies,
  formats,
  theaters,
  moods,
  filters,
  onFiltersChange,
  children,
}: MovieFiltersProps) {
  const [draft, setDraft] = useState<MovieFilters>(filters);

  // Extract unique genres and languages from movies
  const allGenres = Array.from(
    new Set(movies.flatMap((m) => m.genres || []))
  ).sort();
  const allLanguages = Array.from(
    new Set(movies.map((m) => m.language).filter(Boolean) as string[])
  ).sort();

  const activeFilterCount = countActiveFilters(filters);

  const handleApply = () => {
    onFiltersChange(draft);
  };

  const handleReset = () => {
    const reset = { ...DEFAULT_FILTERS };
    setDraft(reset);
    onFiltersChange(reset);
  };

  const toggleGenre = (genre: string) => {
    setDraft((prev) => ({
      ...prev,
      genres: prev.genres.includes(genre)
        ? prev.genres.filter((g) => g !== genre)
        : [...prev.genres, genre],
    }));
  };

  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            Filters
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Clear all
              </Button>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Genre Multi-Select */}
          <div>
            <Label className="mb-2 block">Genres</Label>
            <div className="flex flex-wrap gap-1.5">
              {allGenres.map((genre) => (
                <Badge
                  key={genre}
                  variant={draft.genres.includes(genre) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleGenre(genre)}
                >
                  {genre}
                  {draft.genres.includes(genre) && (
                    <X className="ml-1 h-3 w-3" />
                  )}
                </Badge>
              ))}
              {allGenres.length === 0 && (
                <p className="text-sm text-muted-foreground">No genres available</p>
              )}
            </div>
          </div>

          {/* Rating Range */}
          <div>
            <Label className="mb-2 block">
              Rating: {draft.ratingMin} - {draft.ratingMax}
            </Label>
            <div className="px-2">
              <Slider
                min={0}
                max={10}
                step={0.5}
                value={[draft.ratingMin, draft.ratingMax]}
                onValueChange={([min, max]) =>
                  setDraft((prev) => ({ ...prev, ratingMin: min, ratingMax: max }))
                }
              />
            </div>
          </div>

          {/* Theater */}
          <div>
            <Label className="mb-2 block">Theater</Label>
            <Select
              value={draft.theaterId}
              onValueChange={(v) =>
                setDraft((prev) => ({ ...prev, theaterId: v === "all" ? "" : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All theaters" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All theaters</SelectItem>
                {theaters.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Format */}
          <div>
            <Label className="mb-2 block">Format</Label>
            <Select
              value={draft.formatId}
              onValueChange={(v) =>
                setDraft((prev) => ({ ...prev, formatId: v === "all" ? "" : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All formats" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All formats</SelectItem>
                {formats.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-2 block">From</Label>
              <Input
                type="date"
                value={draft.dateFrom}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, dateFrom: e.target.value }))
                }
              />
            </div>
            <div>
              <Label className="mb-2 block">To</Label>
              <Input
                type="date"
                value={draft.dateTo}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, dateTo: e.target.value }))
                }
              />
            </div>
          </div>

          {/* Mood */}
          <div>
            <Label className="mb-2 block">Mood</Label>
            <Select
              value={draft.moodId}
              onValueChange={(v) =>
                setDraft((prev) => ({ ...prev, moodId: v === "all" ? "" : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All moods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All moods</SelectItem>
                {moods.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.emoji && `${m.emoji} `}{m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Language */}
          <div>
            <Label className="mb-2 block">Language</Label>
            <Select
              value={draft.language}
              onValueChange={(v) =>
                setDraft((prev) => ({ ...prev, language: v === "all" ? "" : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All languages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All languages</SelectItem>
                {allLanguages.map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    {lang}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Apply / Reset */}
          <div className="flex gap-2 pt-2">
            <SheetClose asChild>
              <Button className="flex-1" onClick={handleApply}>
                Apply Filters
              </Button>
            </SheetClose>
            <Button variant="outline" onClick={handleReset}>
              Reset
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function countActiveFilters(filters: MovieFilters): number {
  let count = 0;
  if (filters.genres.length > 0) count++;
  if (filters.ratingMin > 0 || filters.ratingMax < 10) count++;
  if (filters.theaterId) count++;
  if (filters.formatId) count++;
  if (filters.dateFrom || filters.dateTo) count++;
  if (filters.moodId) count++;
  if (filters.language) count++;
  return count;
}

export function applyFilters(
  movies: MovieWithRelations[],
  filters: MovieFilters
): MovieWithRelations[] {
  return movies.filter((movie) => {
    // Genre filter
    if (
      filters.genres.length > 0 &&
      !filters.genres.some((g) => (movie.genres || []).includes(g))
    ) {
      return false;
    }

    // Rating filter
    if (movie.rating != null) {
      if (movie.rating < filters.ratingMin || movie.rating > filters.ratingMax) {
        return false;
      }
    } else if (filters.ratingMin > 0) {
      return false; // Exclude unrated if min is set
    }

    // Theater filter
    if (filters.theaterId && movie.theater_id !== filters.theaterId) {
      return false;
    }

    // Format filter
    if (filters.formatId && movie.format_id !== filters.formatId) {
      return false;
    }

    // Date range
    if (filters.dateFrom && movie.date < filters.dateFrom) {
      return false;
    }
    if (filters.dateTo && movie.date > filters.dateTo) {
      return false;
    }

    // Mood filter
    if (filters.moodId && movie.mood_id !== filters.moodId) {
      return false;
    }

    // Language filter
    if (filters.language && movie.language !== filters.language) {
      return false;
    }

    return true;
  });
}

export { DEFAULT_FILTERS };
