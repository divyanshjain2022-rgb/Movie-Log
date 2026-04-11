"use client";

import Link from "next/link";
import { Star, Film } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/formula";
import { cn } from "@/lib/utils";
import type { MovieWithRelations } from "@/types";

type CostMode = "ticket" | "ticket_fnb" | "all";

interface RecentMoviesProps {
  movies: MovieWithRelations[];
  costMode?: CostMode;
}

function getRatingStyle(rating: number) {
  if (rating >= 8) return "bg-emerald-500/15 text-emerald-400";
  if (rating >= 6) return "bg-primary/15 text-primary";
  if (rating >= 4) return "bg-orange-500/15 text-orange-400";
  return "bg-red-500/15 text-red-400";
}

function getMovieCostByMode(movie: MovieWithRelations, mode: CostMode): number {
  const m = movie as any;
  const gcSavings = (m.movie_gift_cards || []).reduce((sum: number, mgc: any) => {
    const discount = mgc.gift_card?.discount_percent || 0;
    return sum + mgc.amount_used * (discount / 100);
  }, 0);
  const passport = m.passport_savings || 0;
  const ticket = (m.ticket_cost || 0) + (m.convenience_fee || 0) - passport - gcSavings;
  if (mode === "ticket") return Math.max(ticket, 0);
  const fnb = m.fnb_cost || 0;
  if (mode === "ticket_fnb") return Math.max(ticket + fnb, 0);
  const other = m.other_expenses || 0;
  return Math.max(ticket + fnb + other, 0);
}

export function RecentMovies({ movies, costMode = "all" }: RecentMoviesProps) {
  if (movies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl bg-card/30 p-12 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/8">
          <Film className="h-7 w-7 text-primary/50" strokeWidth={1.5} />
        </div>
        <p className="text-base font-semibold">No movies yet</p>
        <p className="mt-1.5 text-sm text-muted-foreground/70">
          Start logging your cinema experiences
        </p>
        <Link
          href="/movies/new"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all active:scale-[0.97]"
        >
          Add Your First Movie
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 stagger">
      {movies.map((movie) => (
        <Link key={movie.id} href={`/movies/${movie.id}`} className="block">
          <div className="group flex gap-3.5 rounded-2xl bg-card/40 p-3.5 transition-all duration-300 active:scale-[0.98] hover:bg-card/70">
            {/* Poster */}
            {movie.poster_url ? (
              <div className="relative h-[72px] w-12 flex-shrink-0 overflow-hidden rounded-xl">
                <img
                  src={movie.poster_url}
                  alt={movie.title}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="flex h-[72px] w-12 flex-shrink-0 items-center justify-center rounded-xl bg-secondary/50">
                <Film className="h-5 w-5 text-muted-foreground/40" strokeWidth={1.5} />
              </div>
            )}

            {/* Content */}
            <div className="min-w-0 flex-1 flex flex-col justify-center">
              <div className="flex items-start justify-between gap-2">
                <h3 className="truncate text-[15px] font-semibold leading-tight">
                  {movie.title}
                </h3>
                {movie.rating && (
                  <div className={cn(
                    "flex items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-xs font-bold tabular-nums flex-shrink-0",
                    getRatingStyle(movie.rating)
                  )}>
                    {movie.rating}
                  </div>
                )}
              </div>

              <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground/60">
                <span>{formatDate(movie.date)}</span>
                {movie.format && (
                  <>
                    <span className="text-white/10">·</span>
                    <span>{movie.format.name}</span>
                  </>
                )}
              </div>

              <div className="mt-1 text-xs font-medium text-muted-foreground/50">
                {formatCurrency(getMovieCostByMode(movie, costMode))}
                {movie.theater && (
                  <span> · {movie.theater.name}</span>
                )}
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
