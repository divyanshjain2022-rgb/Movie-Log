"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Film, Sparkles, Calendar, ListTodo } from "lucide-react";
import {
  SummaryCard,
  QuickStats,
  RecentMovies,
  GCStatus,
} from "@/components/dashboard";
import { YearFilter, type YearFilterValue } from "@/components/shared";
import { formatCurrency } from "@/lib/formula";
import { cn } from "@/lib/utils";
import type { HomeData, HomeMovie } from "@/lib/server/home-data";

type CostMode = "ticket" | "ticket_fnb" | "all";

export function DashboardClient({
  movies,
  giftCards,
  pendingWatchlistCount,
  currentBudgetAmount,
  passportCostTotal,
}: HomeData) {
  const [costMode, setCostMode] = useState<CostMode>("all");
  const [year, setYear] = useState<YearFilterValue>(new Date().getFullYear());

  const getMovieCost = (m: HomeMovie, mode: CostMode) => {
    // GC discount savings
    const gcSavings = (m.movie_gift_cards || []).reduce((sum, mgc) => {
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
  };

  const stats = useMemo(() => {
    const yearMovies = year === "all"
      ? movies
      : movies.filter((m) => new Date(m.date).getFullYear() === year);

    const totalSpend = yearMovies.reduce((sum, m) => sum + getMovieCost(m, costMode), 0);
    const movieCount = yearMovies.length;
    const ratedMovies = yearMovies.filter((m) => m.rating != null && m.rating > 0);
    const averageRating =
      ratedMovies.length > 0
        ? ratedMovies.reduce((sum, m) => sum + (m.rating || 0), 0) / ratedMovies.length
        : 0;
    const greatCount = yearMovies.filter((m) => (m.rating || 0) >= 7).length;
    const mehCount = yearMovies.filter((m) => m.rating != null && (m.rating || 0) < 6).length;

    const totalSaved = giftCards.reduce(
      (sum, gc) => sum + (gc.face_value - gc.amount_paid),
      0
    );

    const grossPassportSavings = yearMovies.reduce(
      (sum, m) => sum + (m.passport_savings || 0),
      0
    );
    const passportSavings = grossPassportSavings - passportCostTotal;

    const totalRuntime = yearMovies.reduce(
      (sum, m) => sum + (m.runtime_minutes || 0),
      0
    );

    return { totalSpend, movieCount, averageRating, greatCount, mehCount, totalSaved, passportSavings, totalRuntime };
  }, [movies, giftCards, passportCostTotal, year, costMode]);

  const recentMovies = useMemo(() => {
    return [...movies]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [movies]);

  const availableYears = useMemo(() => {
    const years = [...new Set(movies.map((m) => new Date(m.date).getFullYear()))].sort((a, b) => b - a);
    return years.length > 0 ? years : [new Date().getFullYear()];
  }, [movies]);

  useEffect(() => {
    if (year !== "all" && !availableYears.includes(year)) {
      setYear(availableYears[0]);
    }
  }, [availableYears, year]);

  const yearLabel = year === "all" ? "All Time" : String(year);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-2xl border-b border-white/[0.04]">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/25 to-amber-600/15 ring-1 ring-primary/25">
              <Film className="h-4 w-4 text-primary" strokeWidth={2} />
            </div>
            <span className="marquee text-gradient-gold text-[22px] leading-none">CINEMALOG</span>
          </div>
          <Link href="/movies/new">
            <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 text-black shadow-[0_4px_18px_-6px_rgba(245,158,11,0.55)] transition-all active:scale-95">
              <Plus className="h-4.5 w-4.5" strokeWidth={2.25} />
            </button>
          </Link>
        </div>
      </header>

      {/* Year + Cost Mode */}
      <div className="px-4 pt-3 space-y-2">
        <YearFilter years={availableYears} value={year} onChange={setYear} />
        <div className="flex rounded-xl bg-secondary/50 p-1">
          {([
            { key: "ticket" as CostMode, label: "Ticket" },
            { key: "ticket_fnb" as CostMode, label: "Ticket + F&B" },
            { key: "all" as CostMode, label: "All Costs" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setCostMode(key)}
              className={cn(
                "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-all",
                costMode === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground/70"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="space-y-5 p-4 stagger">
        {/* Year Summary */}
        <SummaryCard
          yearLabel={yearLabel}
          totalSpend={stats.totalSpend}
          movieCount={stats.movieCount}
          averageRating={stats.averageRating}
          totalRuntime={stats.totalRuntime}
        />

        {/* Quick Stats */}
        <QuickStats
          saved={stats.totalSaved}
          greatCount={stats.greatCount}
          mehCount={stats.mehCount}
          passportSavings={stats.passportSavings}
        />

        {/* Quick Links */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Link
            href="/recommendations"
            className="flex min-h-[76px] items-center gap-3 rounded-2xl bg-card/40 p-3.5 transition-all active:scale-[0.97] hover:bg-card/60"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
              <Sparkles className="h-4.5 w-4.5 text-emerald-400" strokeWidth={1.75} />
            </div>
            <span className="text-sm font-medium leading-tight">PVR Picks</span>
          </Link>
          <Link
            href="/calendar"
            className="flex min-h-[76px] items-center gap-3 rounded-2xl bg-card/40 p-3.5 transition-all active:scale-[0.97] hover:bg-card/60"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
              <Calendar className="h-4.5 w-4.5 text-blue-400" strokeWidth={1.75} />
            </div>
            <span className="text-sm font-medium leading-tight">Calendar</span>
          </Link>
          <Link
            href="/watchlist"
            className="col-span-2 flex min-h-[76px] items-center justify-between rounded-2xl bg-card/40 p-3.5 transition-all active:scale-[0.97] hover:bg-card/60 sm:col-span-1 sm:gap-3 sm:justify-start"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10">
                <ListTodo className="h-4.5 w-4.5 text-orange-400" strokeWidth={1.75} />
              </div>
              <span className="text-sm font-medium leading-tight">Watchlist</span>
            </div>
            {pendingWatchlistCount > 0 && (
              <span className="ml-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-orange-500/15 px-1.5 text-[11px] font-bold text-orange-400 sm:ml-1.5 sm:h-4.5 sm:min-w-4.5 sm:px-1 sm:text-[10px]">
                {pendingWatchlistCount}
              </span>
            )}
          </Link>
        </div>

        {/* Budget Progress */}
        {(() => {
          if (currentBudgetAmount == null) return null;
          const now = new Date();
          const monthMovies = movies.filter((m) => {
            const d = new Date(m.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          });
          const monthSpend = monthMovies.reduce((sum, m) => sum + getMovieCost(m, costMode), 0);
          const pct = currentBudgetAmount > 0 ? (monthSpend / currentBudgetAmount) * 100 : 0;
          const barColor = pct > 100 ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-emerald-500";

          return (
            <Link href="/settings/budget" className="block">
              <div className="rounded-2xl bg-card/40 p-4">
                <div className="flex items-center justify-between text-sm mb-2.5">
                  <span className="text-muted-foreground/60 text-xs font-medium">Monthly Budget</span>
                  <span className="font-semibold text-xs">
                    {formatCurrency(monthSpend)} / {formatCurrency(currentBudgetAmount)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary/50">
                  <div
                    className={cn("h-full rounded-full transition-all duration-700 ease-out", barColor)}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            </Link>
          );
        })()}

        {/* Recent Movies */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="marquee text-[17px] uppercase leading-none text-foreground/90">Recent</h2>
            <Link
              href="/movies"
              className="text-xs font-medium text-primary/70 hover:text-primary transition-colors"
            >
              See all
            </Link>
          </div>
          <RecentMovies movies={recentMovies} costMode={costMode} />
        </section>

        {/* Gift Cards */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="marquee text-[17px] uppercase leading-none text-foreground/90">Gift Cards</h2>
            <Link
              href="/gift-cards"
              className="text-xs font-medium text-primary/70 hover:text-primary transition-colors"
            >
              Manage
            </Link>
          </div>
          <GCStatus giftCards={giftCards} />
        </section>

        {/* Year Wrapped CTA */}
        {year !== "all" && stats.movieCount > 0 && (
          <Link href="/year-wrapped">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600/12 via-fuchsia-500/8 to-primary/8 p-5 transition-all active:scale-[0.98]">
              <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-violet-500/10 blur-2xl" />

              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15">
                    <Sparkles className="h-5 w-5 text-violet-400" strokeWidth={1.75} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[15px]">{yearLabel} Wrapped</h3>
                    <p className="text-xs text-muted-foreground/60">
                      Your year in cinema
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-extrabold tracking-tight text-violet-400">{stats.movieCount}</div>
                  <div className="text-[10px] text-muted-foreground/50 font-medium">films</div>
                </div>
              </div>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
