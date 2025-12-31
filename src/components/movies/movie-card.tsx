"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, getRatingColor } from "@/lib/formula";
import { cn } from "@/lib/utils";
import type { MovieWithRelations } from "@/types";

interface MovieCardProps {
  movie: MovieWithRelations;
  variant?: "default" | "compact";
}

export function MovieCard({ movie, variant = "default" }: MovieCardProps) {
  if (variant === "compact") {
    return (
      <Link href={`/movies/${movie.id}`}>
        <Card className="transition-colors hover:bg-secondary/50">
          <CardContent className="flex items-center gap-3 p-3">
            {movie.poster_url && (
              <div className="h-12 w-8 flex-shrink-0 overflow-hidden rounded">
                <img
                  src={movie.poster_url}
                  alt={movie.title}
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-medium">{movie.title}</h3>
              <p className="text-xs text-muted-foreground">
                {formatDate(movie.date)}
                {movie.rating && (
                  <span className={cn("ml-2", getRatingColor(movie.rating))}>
                    {movie.rating}/10
                  </span>
                )}
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium">
                {formatCurrency(movie.total_cost)}
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  }

  return (
    <Link href={`/movies/${movie.id}`}>
      <Card className="overflow-hidden transition-colors hover:bg-secondary/50">
        <div className="flex">
          {movie.poster_url && (
            <div className="h-32 w-20 flex-shrink-0">
              <img
                src={movie.poster_url}
                alt={movie.title}
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <CardContent className="flex flex-1 flex-col justify-between p-4">
            <div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold leading-tight">{movie.title}</h3>
                {movie.rating && (
                  <span
                    className={cn(
                      "flex-shrink-0 text-lg font-bold",
                      getRatingColor(movie.rating)
                    )}
                  >
                    {movie.rating}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDate(movie.date)}
                {movie.theater && ` \u2022 ${movie.theater.name}`}
              </p>
              {movie.genres && movie.genres.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {movie.genres.slice(0, 3).map((genre) => (
                    <Badge
                      key={genre}
                      variant="secondary"
                      className="text-xs"
                    >
                      {genre}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {movie.format?.name}
              </span>
              <span className="font-medium">
                {formatCurrency(movie.total_cost)}
              </span>
            </div>
          </CardContent>
        </div>
      </Card>
    </Link>
  );
}
