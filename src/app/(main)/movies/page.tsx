"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Plus, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared";
import { MovieCard } from "@/components/movies";
import {
  MovieFiltersSheet,
  applyFilters,
  countActiveFilters,
  DEFAULT_FILTERS,
  type MovieFilters,
} from "@/components/movies/movie-filters";
import { useMovies, useLookupData } from "@/hooks";

export default function MoviesPage() {
  const { movies, isLoading } = useMovies();
  const { formats, theaters, moods } = useLookupData();
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<MovieFilters>(DEFAULT_FILTERS);

  const activeFilterCount = countActiveFilters(filters);

  const filteredMovies = useMemo(() => {
    let result = movies;

    // Apply search
    if (searchQuery) {
      result = result.filter((movie) =>
        movie.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply filters
    result = applyFilters(result, filters);

    // Sort by date
    return result.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [movies, searchQuery, filters]);

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Movie Log"
        action={
          <Link href="/movies/new">
            <Button size="icon" className="h-9 w-9">
              <Plus className="h-5 w-5" />
            </Button>
          </Link>
        }
      />

      <div className="p-4">
        {/* Search and Filter */}
        <div className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search movies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
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
            <Button variant="outline" size="icon" className="relative">
              <Filter className="h-4 w-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </MovieFiltersSheet>
        </div>

        {/* Active Filter Tags */}
        {activeFilterCount > 0 && (
          <div className="mb-3 flex flex-wrap gap-1">
            {filters.genres.map((g) => (
              <Badge key={g} variant="secondary" className="text-xs">
                {g}
              </Badge>
            ))}
            {(filters.ratingMin > 0 || filters.ratingMax < 10) && (
              <Badge variant="secondary" className="text-xs">
                Rating: {filters.ratingMin}-{filters.ratingMax}
              </Badge>
            )}
            {filters.language && (
              <Badge variant="secondary" className="text-xs">
                {filters.language}
              </Badge>
            )}
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        )}

        {/* Result count */}
        {!isLoading && (searchQuery || activeFilterCount > 0) && (
          <p className="mb-3 text-xs text-muted-foreground">
            {filteredMovies.length} of {movies.length} movies
          </p>
        )}

        {/* Movie List */}
        <div className="space-y-3">
          {isLoading ? (
            <>
              <Skeleton className="h-[120px]" />
              <Skeleton className="h-[120px]" />
              <Skeleton className="h-[120px]" />
            </>
          ) : filteredMovies.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-muted-foreground">
                {searchQuery || activeFilterCount > 0
                  ? "No movies found"
                  : "No movies logged yet"}
              </p>
              {searchQuery || activeFilterCount > 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Try adjusting your search or filters
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Tap the + button to add your first movie
                </p>
              )}
            </div>
          ) : (
            filteredMovies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
