"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Film, Sparkles, Calendar, ListTodo } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SummaryCard,
  QuickStats,
  RecentMovies,
  GCStatus,
} from "@/components/dashboard";
import { useMovies, useGiftCards, useWatchlist, useBudgets } from "@/hooks";
import { formatCurrency } from "@/lib/formula";
import { cn } from "@/lib/utils";

type CostMode = "ticket" | "ticket_fnb" | "all";

export default function DashboardPage() {
  const { movies, isLoading: moviesLoading } = useMovies();
  const { giftCards, isLoading: giftCardsLoading } = useGiftCards();
  const { items: watchlistItems } = useWatchlist();
  const { budgets } = useBudgets();
  const [costMode, setCostMode] = useState<CostMode>("all");

  const year = new Date().getFullYear();

  const getMovieCost = (m: (typeof movies)[number], mode: CostMode) => {
    const ticket = (m.ticket_cost || 0) + (m.convenience_fee || 0);
    if (mode === "ticket") return ticket;
    const fnb = m.fnb_cost || 0;
    if (mode === "ticket_fnb") return ticket + fnb;
    return m.total_cost || 0; // all = ticket + convenience + fnb + other
  };

  const stats = useMemo(() => {
    const yearMovies = movies.filter(
      (m) => new Date(m.date).getFullYear() === year
    );

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

    const passportSavings = yearMovies.reduce(
      (sum, m) => sum + (m.passport_savings || 0),
      0
    );

    const totalRuntime = yearMovies.reduce(
      (sum, m) => sum + (m.runtime_minutes || 0),
      0
    );

    return { totalSpend, movieCount, averageRating, greatCount, mehCount, totalSaved, passportSavings, totalRuntime };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movies, giftCards, year, costMode]);

  const recentMovies = useMemo(() => {
    return [...movies]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [movies]);

  const isLoading = moviesLoading || giftCardsLoading;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-2xl border-b border-white/[0.04]">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/12">
              <Film className="h-4 w-4 text-primary" strokeWidth={2} />
            </div>
            <span className="text-[17px] font-bold tracking-tight">CinemaLog</span>
          </div>
          <Link href="/movies/new">
            <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all active:scale-95">
              <Plus className="h-4.5 w-4.5" strokeWidth={2.25} />
            </button>
          </Link>
        </div>
      </header>

      {/* Cost Mode Toggle */}
      <div className="px-4 pt-3">
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
        {isLoading ? (
          <Skeleton className="h-[180px] w-full rounded-3xl" />
        ) : (
          <SummaryCard
            year={year}
            totalSpend={stats.totalSpend}
            movieCount={stats.movieCount}
            averageRating={stats.averageRating}
            totalRuntime={stats.totalRuntime}
          />
        )}

        {/* Quick Stats */}
        {isLoading ? (
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-[100px] rounded-2xl" />
            <Skeleton className="h-[100px] rounded-2xl" />
            <Skeleton className="h-[100px] rounded-2xl" />
          </div>
        ) : (
          <QuickStats
            saved={stats.totalSaved}
            greatCount={stats.greatCount}
            mehCount={stats.mehCount}
            passportSavings={stats.passportSavings}
          />
        )}

        {/* Quick Links */}
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/calendar"
            className="flex items-center gap-3 rounded-2xl bg-card/40 p-3.5 transition-all active:scale-[0.97] hover:bg-card/60"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
              <Calendar className="h-4.5 w-4.5 text-blue-400" strokeWidth={1.75} />
            </div>
            <span className="text-sm font-medium">Calendar</span>
          </Link>
          <Link
            href="/watchlist"
            className="flex items-center gap-3 rounded-2xl bg-card/40 p-3.5 transition-all active:scale-[0.97] hover:bg-card/60"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10">
              <ListTodo className="h-4.5 w-4.5 text-orange-400" strokeWidth={1.75} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">Watchlist</span>
              {watchlistItems.filter((w) => !w.watched_movie_id).length > 0 && (
                <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-orange-500/15 px-1 text-[10px] font-bold text-orange-400">
                  {watchlistItems.filter((w) => !w.watched_movie_id).length}
                </span>
              )}
            </div>
          </Link>
        </div>

        {/* Budget Progress */}
        {(() => {
          const now = new Date();
          const currentBudget = budgets.find(
            (b) => b.month === now.getMonth() + 1 && b.year === now.getFullYear()
          );
          if (!currentBudget) return null;
          const monthMovies = movies.filter((m) => {
            const d = new Date(m.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          });
          const monthSpend = monthMovies.reduce((sum, m) => sum + getMovieCost(m, costMode), 0);
          const pct = currentBudget.amount > 0 ? (monthSpend / currentBudget.amount) * 100 : 0;
          const barColor = pct > 100 ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-emerald-500";

          return (
            <Link href="/settings/budget" className="block">
              <div className="rounded-2xl bg-card/40 p-4">
                <div className="flex items-center justify-between text-sm mb-2.5">
                  <span className="text-muted-foreground/60 text-xs font-medium">Monthly Budget</span>
                  <span className="font-semibold text-xs">
                    {formatCurrency(monthSpend)} / {formatCurrency(currentBudget.amount)}
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
            <h2 className="text-[15px] font-semibold">Recent</h2>
            <Link
              href="/movies"
              className="text-xs font-medium text-primary/70 hover:text-primary transition-colors"
            >
              See all
            </Link>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-[88px] rounded-2xl" />
              <Skeleton className="h-[88px] rounded-2xl" />
            </div>
          ) : (
            <RecentMovies movies={recentMovies} />
          )}
        </section>

        {/* Gift Cards */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Gift Cards</h2>
            <Link
              href="/gift-cards"
              className="text-xs font-medium text-primary/70 hover:text-primary transition-colors"
            >
              Manage
            </Link>
          </div>
          {isLoading ? (
            <Skeleton className="h-[72px] rounded-2xl" />
          ) : (
            <GCStatus giftCards={giftCards} />
          )}
        </section>

        {/* Year Wrapped CTA */}
        {!isLoading && stats.movieCount > 0 && (
          <Link href="/year-wrapped">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600/12 via-fuchsia-500/8 to-primary/8 p-5 transition-all active:scale-[0.98]">
              <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-violet-500/10 blur-2xl" />

              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15">
                    <Sparkles className="h-5 w-5 text-violet-400" strokeWidth={1.75} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[15px]">{year} Wrapped</h3>
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
