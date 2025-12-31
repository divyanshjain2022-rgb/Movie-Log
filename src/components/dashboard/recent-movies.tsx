"use client";

import Link from "next/link";
import { Star, Calendar, MapPin, ChevronRight, Film } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/formula";
import { cn } from "@/lib/utils";
import type { MovieWithRelations } from "@/types";

interface RecentMoviesProps {
  movies: MovieWithRelations[];
}

function getRatingBadgeStyle(rating: number) {
  if (rating >= 8) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (rating >= 6) return "bg-primary/20 text-primary border-primary/30";
  if (rating >= 4) return "bg-orange-500/20 text-orange-400 border-orange-500/30";
  return "bg-red-500/20 text-red-400 border-red-500/30";
}

export function RecentMovies({ movies }: RecentMoviesProps) {
  if (movies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 bg-card/30 p-10 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Film className="h-8 w-8 text-primary/60" />
        </div>
        <p className="text-lg font-medium">No movies yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Start logging your cinema experiences
        </p>
        <Link
          href="/movies/new"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Add Your First Movie
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {movies.map((movie) => (
        <Link key={movie.id} href={`/movies/${movie.id}`}>
          <div className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/50 p-4 transition-all duration-200 hover:border-primary/30 hover:bg-card">
            <div className="flex gap-4">
              {/* Poster */}
              {movie.poster_url ? (
                <div className="relative h-20 w-14 flex-shrink-0 overflow-hidden rounded-lg shadow-lg">
                  <img
                    src={movie.poster_url}
                    alt={movie.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                </div>
              ) : (
                <div className="flex h-20 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <Film className="h-6 w-6 text-muted-foreground" />
                </div>
              )}

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate font-semibold group-hover:text-primary transition-colors">
                    {movie.title}
                  </h3>
                  {movie.rating && (
                    <div className={cn(
                      "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                      getRatingBadgeStyle(movie.rating)
                    )}>
                      <Star className="h-3 w-3 fill-current" />
                      {movie.rating}
                    </div>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(movie.date)}
                  </span>
                  {movie.format && (
                    <span className="rounded bg-secondary/50 px-1.5 py-0.5">
                      {movie.format.name}
                    </span>
                  )}
                  {movie.theater && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {movie.theater.name}
                    </span>
                  )}
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-primary">
                    {formatCurrency(movie.total_cost)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
