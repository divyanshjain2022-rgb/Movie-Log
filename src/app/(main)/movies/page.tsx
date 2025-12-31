"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Plus, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared";
import { MovieCard } from "@/components/movies";
import { useMovies } from "@/hooks";

export default function MoviesPage() {
  const { movies, isLoading } = useMovies();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredMovies = useMemo(() => {
    return movies
      .filter((movie) =>
        movie.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [movies, searchQuery]);

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
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
        </div>

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
                {searchQuery ? "No movies found" : "No movies logged yet"}
              </p>
              {searchQuery ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Try a different search term
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
