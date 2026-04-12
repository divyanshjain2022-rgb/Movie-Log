"use client";

import { formatCurrency } from "@/lib/formula";

interface SummaryCardProps {
  yearLabel: string;
  totalSpend: number;
  movieCount: number;
  averageRating: number;
  totalRuntime?: number;
}

export function SummaryCard({
  yearLabel,
  totalSpend,
  movieCount,
  averageRating,
  totalRuntime,
}: SummaryCardProps) {
  const runtimeHours = totalRuntime ? Math.floor(totalRuntime / 60) : 0;
  const runtimeMins = totalRuntime ? totalRuntime % 60 : 0;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6">
      {/* Ambient glow */}
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/8 blur-3xl" />
      <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-primary/5 blur-2xl" />

      <div className="relative">
        {/* Header */}
        <div className="flex items-baseline gap-2 mb-5">
          <span className="text-3xl font-bold tracking-tight">{yearLabel}</span>
          <span className="text-sm text-muted-foreground font-medium">
            {yearLabel === "All Time" ? "Cinema Summary" : "Year in Cinema"}
          </span>
        </div>

        {/* Big number */}
        <div className="mb-5">
          <div className="text-4xl font-extrabold tracking-tight text-primary">
            {movieCount}
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">
            movies watched
          </div>
        </div>

        {/* Stat row */}
        <div className="flex items-center gap-6">
          <div>
            <div className="text-xs text-muted-foreground/70 mb-0.5">Spent</div>
            <div className="text-[15px] font-semibold">{formatCurrency(totalSpend)}</div>
          </div>
          <div className="h-8 w-px bg-white/[0.06]" />
          <div>
            <div className="text-xs text-muted-foreground/70 mb-0.5">Avg Rating</div>
            <div className="text-[15px] font-semibold">
              {averageRating > 0 ? `${averageRating.toFixed(1)}/10` : "—"}
            </div>
          </div>
          {totalRuntime != null && totalRuntime > 0 && (
            <>
              <div className="h-8 w-px bg-white/[0.06]" />
              <div>
                <div className="text-xs text-muted-foreground/70 mb-0.5">Runtime</div>
                <div className="text-[15px] font-semibold">
                  {runtimeHours}h {runtimeMins}m
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
