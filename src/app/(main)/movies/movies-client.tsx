"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Plus, Search, SlidersHorizontal, ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { MovieCard, DEFAULT_COST_COMPONENTS, type CostComponents } from "@/components/movies/movie-card";
import {
  MovieFiltersSheet,
  applyFilters,
  countActiveFilters,
  DEFAULT_FILTERS,
  type MovieFilters,
} from "@/components/movies/movie-filters";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { MoviesListData } from "@/lib/server/movies-data";

export function MoviesClient({ movies, formats, theaters, moods }: MoviesListData) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<MovieFilters>(DEFAULT_FILTERS);
  const [costComponents, setCostComponents] = useState<CostComponents>(DEFAULT_COST_COMPONENTS);

  const toggleCost = (key: keyof CostComponents) => {
    setCostComponents(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const isCustomCost = !costComponents.ticket || !costComponents.bookingFee || !costComponents.fnb || !costComponents.other;

  const activeFilterCount = countActiveFilters(filters);

  const filteredMovies = useMemo(() => {
    let result = movies;

    if (searchQuery) {
      result = result.filter((movie) =>
        movie.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    result = applyFilters(result, filters);

    return result.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [movies, searchQuery, filters]);

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Movies"
        action={
          <Link href="/movies/new">
            <button className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all active:scale-95">
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </Link>
        }
      />

      <div className="p-4">
        {/* Cost Components */}
        <div className="mb-3 flex items-center gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn(
                "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all",
                isCustomCost
                  ? "bg-primary/12 text-primary"
                  : "bg-card/50 text-muted-foreground/60 hover:text-muted-foreground"
              )}>
                Cost
                <ChevronDown className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-48 p-2">
              <p className="px-2 pb-1.5 text-[11px] font-medium text-muted-foreground/50">Include in displayed cost</p>
              {([
                { key: "ticket" as const, label: "Ticket" },
                { key: "bookingFee" as const, label: "Booking Fee" },
                { key: "fnb" as const, label: "F&B" },
                { key: "other" as const, label: "Other Expenses" },
              ]).map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-secondary/30 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={costComponents[key]}
                    onChange={() => toggleCost(key)}
                    className="h-3.5 w-3.5 rounded border-border accent-primary"
                  />
                  <span className="text-xs">{label}</span>
                </label>
              ))}
            </PopoverContent>
          </Popover>
          <span className="text-[10px] text-muted-foreground/30">
            Passport & GC discounts always applied
          </span>
        </div>

        {/* Search and Filter */}
        <div className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40" strokeWidth={1.75} />
            <input
              placeholder="Search movies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border-0 bg-card/50 py-2.5 pl-9 pr-4 text-sm placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
            />
          </div>
          <MovieFiltersSheet
            movies={movies}
            formats={formats}
            theaters={theaters}
            moods={moods}
            filters={filters}
            onFiltersChange={setFilters}
          >
            <button className={cn(
              "flex h-[42px] w-[42px] items-center justify-center rounded-xl transition-all",
              activeFilterCount > 0
                ? "bg-primary/12 text-primary"
                : "bg-card/50 text-muted-foreground/50 hover:text-muted-foreground"
            )}>
              <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} />
              {activeFilterCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </MovieFiltersSheet>
        </div>

        {/* Active Filter Tags */}
        {activeFilterCount > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {filters.genres.map((g) => (
              <span key={g} className="rounded-lg bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {g}
              </span>
            ))}
            {(filters.ratingMin > 0 || filters.ratingMax < 10) && (
              <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {filters.ratingMin}–{filters.ratingMax}
              </span>
            )}
            {filters.language && (
              <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {filters.language}
              </span>
            )}
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="text-[11px] font-medium text-muted-foreground/50 hover:text-muted-foreground ml-1"
            >
              Clear
            </button>
          </div>
        )}

        {/* Result count */}
        {(searchQuery || activeFilterCount > 0) && (
          <p className="mb-3 text-[11px] text-muted-foreground/40 font-medium">
            {filteredMovies.length} of {movies.length} movies
          </p>
        )}

        {/* Movie List */}
        <div className="space-y-4 stagger">
          {filteredMovies.length === 0 ? (
            <div className="rounded-3xl bg-card/30 p-10 text-center">
              <p className="text-sm font-medium text-muted-foreground/70">
                {searchQuery || activeFilterCount > 0
                  ? "No movies found"
                  : "No movies logged yet"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground/40">
                {searchQuery || activeFilterCount > 0
                  ? "Try adjusting your search or filters"
                  : "Tap + to add your first movie"}
              </p>
            </div>
          ) : (
            filteredMovies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} costComponents={costComponents} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
