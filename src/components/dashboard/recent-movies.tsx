"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDate, getRatingColor } from "@/lib/formula";
import { cn } from "@/lib/utils";
import type { MovieWithRelations } from "@/types";

interface RecentMoviesProps {
  movies: MovieWithRelations[];
}

export function RecentMovies({ movies }: RecentMoviesProps) {
  if (movies.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-muted-foreground">No movies logged yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Tap the + button to add your first movie
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {movies.map((movie) => (
        <Link key={movie.id} href={`/movies/${movie.id}`}>
          <Card className="transition-colors hover:bg-secondary/50">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium">{movie.title}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {formatDate(movie.date)}
                    {movie.format && ` \u2022 ${movie.format.name}`}
                    {movie.rating && (
                      <span className={cn("ml-1", getRatingColor(movie.rating))}>
                        {" "}
                        \u2022 {movie.rating}/10
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {formatCurrency(movie.total_cost)}
                    {movie.theater && ` \u2022 ${movie.theater.name}`}
                  </p>
                </div>
                {movie.poster_url && (
                  <div className="h-16 w-11 flex-shrink-0 overflow-hidden rounded">
                    <img
                      src={movie.poster_url}
                      alt={movie.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
