"use client";

import Link from "next/link";
import { Film } from "lucide-react";
import { formatCurrency, formatDate, getRatingColor, getEffectiveCost } from "@/lib/formula";
import { cn } from "@/lib/utils";
import type { MovieWithRelations } from "@/types";

interface MovieCardProps {
  movie: MovieWithRelations;
  variant?: "default" | "compact";
}

function getRatingBg(rating: number) {
  if (rating >= 8) return "bg-emerald-500/12 text-emerald-400";
  if (rating >= 6) return "bg-primary/12 text-primary";
  if (rating >= 4) return "bg-orange-500/12 text-orange-400";
  return "bg-red-500/12 text-red-400";
}

export function MovieCard({ movie, variant = "default" }: MovieCardProps) {
  const effectiveCost = getEffectiveCost(movie as any);

  if (variant === "compact") {
    return (
      <Link href={`/movies/${movie.id}`}>
        <div className="flex items-center gap-3 rounded-2xl bg-card/40 p-3 transition-all active:scale-[0.98] hover:bg-card/60">
          {movie.poster_url ? (
            <div className="h-12 w-8 flex-shrink-0 overflow-hidden rounded-lg">
              <img src={movie.poster_url} alt={movie.title} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="flex h-12 w-8 items-center justify-center rounded-lg bg-secondary/50">
              <Film className="h-4 w-4 text-muted-foreground/30" strokeWidth={1.5} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-medium">{movie.title}</h3>
            <p className="text-xs text-muted-foreground/50">
              {formatDate(movie.date)}
              {movie.rating && (
                <span className={cn("ml-2 font-semibold", getRatingColor(movie.rating))}>
                  {movie.rating}/10
                </span>
              )}
            </p>
          </div>
          <div className="text-xs font-medium text-muted-foreground/50">
            {formatCurrency(effectiveCost)}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/movies/${movie.id}`}>
      <div className="group flex gap-3.5 rounded-2xl bg-card/40 p-3 transition-all duration-200 active:scale-[0.98] hover:bg-card/60">
        {/* Poster */}
        {movie.poster_url ? (
          <div className="relative h-[100px] w-[67px] flex-shrink-0 overflow-hidden rounded-xl">
            <img
              src={movie.poster_url}
              alt={movie.title}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="flex h-[100px] w-[67px] flex-shrink-0 items-center justify-center rounded-xl bg-secondary/30">
            <Film className="h-6 w-6 text-muted-foreground/20" strokeWidth={1.5} />
          </div>
        )}

        {/* Content */}
        <div className="min-w-0 flex-1 flex flex-col justify-between py-0.5">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-[15px] font-semibold leading-tight tracking-tight line-clamp-2">
                {movie.title}
              </h3>
              {movie.rating && (
                <div className={cn(
                  "flex-shrink-0 rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums",
                  getRatingBg(movie.rating)
                )}>
                  {movie.rating}
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground/50">
              {formatDate(movie.date)}
              {movie.theater && ` · ${movie.theater.name}`}
            </p>
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1.5">
              {movie.format && (
                <span className="rounded-md bg-secondary/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground/60">
                  {movie.format.name}
                </span>
              )}
              {movie.genres && movie.genres.length > 0 && (
                <span className="text-[11px] text-muted-foreground/40">
                  {movie.genres.slice(0, 2).join(" · ")}
                </span>
              )}
            </div>
            <span className="text-xs font-semibold text-muted-foreground/50">
              {formatCurrency(effectiveCost)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
