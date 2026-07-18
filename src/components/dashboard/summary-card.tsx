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
    <div className="glass relative overflow-hidden rounded-3xl">
      {/* Film-strip perforations, left and right edges */}
      <div className="film-perf absolute inset-y-2 left-1.5 w-2.5" />
      <div className="film-perf absolute inset-y-2 right-1.5 w-2.5" />

      {/* Marquee glow */}
      <div className="absolute -right-14 -top-14 h-44 w-44 rounded-full bg-primary/12 blur-3xl" />
      <div className="absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-violet-500/8 blur-3xl" />

      <div className="relative px-8 py-6">
        {/* Header */}
        <div className="mb-4 flex items-baseline gap-2.5">
          <span className="marquee text-4xl leading-none text-foreground/95">
            {yearLabel}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
            {yearLabel === "All Time" ? "Cinema Summary" : "Year in Cinema"}
          </span>
        </div>

        {/* Big marquee number */}
        <div className="mb-5 flex items-baseline gap-3">
          <span className="marquee text-gradient-gold text-7xl leading-[0.9]">
            {movieCount}
          </span>
          <span className="text-sm font-medium text-muted-foreground">
            movies
            <br />
            watched
          </span>
        </div>

        {/* Stat row */}
        <div className="flex items-center gap-6">
          <div>
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
              Spent
            </div>
            <div className="marquee text-xl text-foreground/90">
              {formatCurrency(totalSpend)}
            </div>
          </div>
          <div className="h-9 w-px bg-white/[0.08]" />
          <div>
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
              Avg Rating
            </div>
            <div className="marquee text-xl text-foreground/90">
              {averageRating > 0 ? `${averageRating.toFixed(1)}/10` : "—"}
            </div>
          </div>
          {totalRuntime != null && totalRuntime > 0 && (
        <>
              <div className="h-9 w-px bg-white/[0.08]" />
              <div>
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                  Runtime
                </div>
                <div className="marquee text-xl text-foreground/90">
                  {runtimeHours}h {runtimeMins}m
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom marquee light-strip */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
    </div>
  );
}
