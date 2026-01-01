"use client";

import { Film, TrendingUp, Star } from "lucide-react";
import { formatCurrency } from "@/lib/formula";

interface SummaryCardProps {
  year: number;
  totalSpend: number;
  movieCount: number;
  averageRating: number;
}

export function SummaryCard({
  year,
  totalSpend,
  movieCount,
  averageRating,
}: SummaryCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-6 border border-primary/20">
      {/* Background decoration */}
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
      <div className="absolute -bottom-4 -left-4 h-24 w-24 rounded-full bg-primary/5 blur-xl" />

      <div className="relative">
        {/* Year header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20">
            <Film className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="text-2xl font-bold text-primary">{year}</div>
            <div className="text-xs text-muted-foreground">Year in Review</div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="text-xs">Spent</span>
            </div>
            <div className="text-lg font-semibold">{formatCurrency(totalSpend)}</div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Film className="h-3.5 w-3.5" />
              <span className="text-xs">Movies</span>
            </div>
            <div className="text-lg font-semibold">{movieCount}</div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Star className="h-3.5 w-3.5" />
              <span className="text-xs">Avg Rating</span>
            </div>
            <div className="text-lg font-semibold">
              {averageRating > 0 ? averageRating.toFixed(1) : "—"}
            </div>
          </div>
        </div>

        {/* Rating bar */}
        {averageRating > 0 && (
          <div className="mt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary/50">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500"
                style={{ width: `${(averageRating / 10) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
