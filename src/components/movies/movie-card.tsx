"use client";

import Link from "next/link";
import { Film } from "lucide-react";
import { formatCurrency, formatDate, getRatingBadgeClasses,
  getRatingColor, getEffectiveCost } from "@/lib/formula";
import { cn } from "@/lib/utils";
import type { ListMovie } from "@/lib/server/movies-data";
import { tmdbImage } from "@/lib/tmdb-image";

export interface CostComponents {
  ticket: boolean;
  bookingFee: boolean;
  fnb: boolean;
  other: boolean;
}

export const DEFAULT_COST_COMPONENTS: CostComponents = {
  ticket: true,
  bookingFee: true,
  fnb: true,
  other: true,
};

function getCustomCost(movie: ListMovie, components: CostComponents): number {
  const m = movie as any;
  let cost = 0;
  if (components.ticket) cost += m.ticket_cost || 0;
  if (components.bookingFee) cost += m.convenience_fee || 0;
  if (components.fnb) cost += m.fnb_cost || 0;
  if (components.other) cost += m.other_expenses || 0;

  // Always subtract passport savings and GC discounts from active components
  cost -= m.passport_savings || 0;
  const gcSavings = (m.movie_gift_cards || []).reduce((sum: number, mgc: any) => {
    const discount = mgc.gift_card?.discount_percent || 0;
    return sum + mgc.amount_used * (discount / 100);
  }, 0);
  cost -= gcSavings;

  return Math.max(cost, 0);
}

interface MovieCardProps {
  movie: ListMovie;
  variant?: "default" | "compact";
  costComponents?: CostComponents;
}

export function MovieCard({ movie, variant = "default", costComponents }: MovieCardProps) {
  const displayCost = costComponents
    ? getCustomCost(movie, costComponents)
    : getEffectiveCost(movie as any);

  if (variant === "compact") {
    return (
      <Link href={`/movies/${movie.id}`} className="block">
        <div className="flex items-center gap-3 rounded-2xl bg-card/40 p-3 transition-all active:scale-[0.98] hover:bg-card/60">
          {movie.poster_url ? (
            <div className="h-12 w-8 flex-shrink-0 overflow-hidden rounded-lg">
              <img loading="lazy" decoding="async" src={tmdbImage(movie.poster_url, "w154")} alt={movie.title} className="h-full w-full object-cover" />
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
            {formatCurrency(displayCost)}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/movies/${movie.id}`} className="block">
      <div className="glass group flex gap-3.5 rounded-2xl p-3.5 transition-all duration-200 active:scale-[0.98] hover:bg-card/60">
        {/* Poster */}
        {movie.poster_url ? (
          <div className="relative h-[110px] w-[73px] flex-shrink-0 overflow-hidden rounded-xl">
            <img loading="lazy" decoding="async"
              src={tmdbImage(movie.poster_url, "w342")}
              alt={movie.title}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="flex h-[110px] w-[73px] flex-shrink-0 items-center justify-center rounded-xl bg-secondary/30">
            <Film className="h-6 w-6 text-muted-foreground/20" strokeWidth={1.5} />
          </div>
        )}

        {/* Content */}
        <div className="min-w-0 flex-1 flex flex-col justify-between py-0.5">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="marquee text-[18px] uppercase leading-[1.05] line-clamp-2 text-foreground/95">
                {movie.title}
              </h3>
              {movie.rating && (
                <div className={cn(
                  "flex-shrink-0 rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums",
                  getRatingBadgeClasses(movie.rating)
                )}>
                  {movie.rating}
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground/50">
              {formatDate(movie.date)}
              {movie.language && ` · ${movie.language}`}
            </p>
          </div>

          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {movie.format && (
              <span className="rounded-md bg-secondary/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground/60">
                {movie.format.name}
              </span>
            )}
            {movie.theater && (
              <span className="text-[11px] text-muted-foreground/40">
                {movie.theater.name}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-1.5">
              {movie.genres && movie.genres.length > 0 && (
                <span className="text-[11px] text-muted-foreground/40">
                  {movie.genres.slice(0, 2).join(" · ")}
                </span>
              )}
            </div>
            <span className="text-xs font-bold tabular-nums text-muted-foreground/60">
              {formatCurrency(displayCost)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
