"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Plus, Settings, Film, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SummaryCard,
  QuickStats,
  RecentMovies,
  GCStatus,
} from "@/components/dashboard";
import { useMovies, useGiftCards } from "@/hooks";

export default function DashboardPage() {
  const { movies, isLoading: moviesLoading } = useMovies();
  const { giftCards, isLoading: giftCardsLoading } = useGiftCards();

  const year = new Date().getFullYear();

  const stats = useMemo(() => {
    const yearMovies = movies.filter(
      (m) => new Date(m.date).getFullYear() === year
    );

    const totalSpend = yearMovies.reduce((sum, m) => sum + (m.total_cost || 0), 0);
    const movieCount = yearMovies.length;
    const ratedMovies = yearMovies.filter((m) => m.rating != null && m.rating > 0);
    const averageRating =
      ratedMovies.length > 0
        ? ratedMovies.reduce((sum, m) => sum + (m.rating || 0), 0) / ratedMovies.length
        : 0;
    const greatCount = yearMovies.filter((m) => (m.rating || 0) >= 7).length;
    const mehCount = yearMovies.filter((m) => m.rating != null && (m.rating || 0) < 6).length;

    // GC savings: sum of (face_value - amount_paid) for GCs used this year
    const totalSaved = giftCards.reduce(
      (sum, gc) => sum + (gc.face_value - gc.amount_paid),
      0
    );

    // Passport savings
    const passportSavings = yearMovies.reduce(
      (sum, m) => sum + (m.passport_savings || 0),
      0
    );

    // Total runtime
    const totalRuntime = yearMovies.reduce(
      (sum, m) => sum + (m.runtime_minutes || 0),
      0
    );

    return { totalSpend, movieCount, averageRating, greatCount, mehCount, totalSaved, passportSavings, totalRuntime };
  }, [movies, giftCards, year]);

  const recentMovies = useMemo(() => {
    return [...movies]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [movies]);

  const isLoading = moviesLoading || giftCardsLoading;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
              <Film className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold">CinemaLog</h1>
              <p className="text-xs text-muted-foreground">Track your cinema journey</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/movies/new">
              <button className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40 active:scale-95">
                <Plus className="h-5 w-5" />
              </button>
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="space-y-6 p-4">
        {/* Year Summary */}
        {isLoading ? (
          <Skeleton className="h-[140px] w-full rounded-2xl" />
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
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-[100px] rounded-xl" />
            <Skeleton className="h-[100px] rounded-xl" />
            <Skeleton className="h-[100px] rounded-xl" />
          </div>
        ) : (
          <QuickStats
            saved={stats.totalSaved}
            greatCount={stats.greatCount}
            mehCount={stats.mehCount}
            passportSavings={stats.passportSavings}
          />
        )}

        {/* Recent Movies */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent</h2>
            <Link
              href="/movies"
              className="text-sm text-primary hover:underline"
            >
              See all
            </Link>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-[100px] rounded-xl" />
              <Skeleton className="h-[100px] rounded-xl" />
            </div>
          ) : (
            <RecentMovies movies={recentMovies} />
          )}
        </section>

        {/* Gift Cards */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Gift Cards</h2>
            <Link
              href="/gift-cards"
              className="text-sm text-primary hover:underline"
            >
              Manage
            </Link>
          </div>
          {isLoading ? (
            <Skeleton className="h-[80px] rounded-xl" />
          ) : (
            <GCStatus giftCards={giftCards} />
          )}
        </section>

        {/* Year Wrapped CTA */}
        {!isLoading && stats.movieCount > 0 && (
          <Link href="/year-wrapped">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600/20 via-pink-500/20 to-primary/20 p-5 border border-purple-500/20 transition-all hover:border-purple-500/40">
              <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-purple-500/20 blur-2xl" />
              <div className="absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-pink-500/10 blur-xl" />

              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/20">
                    <Sparkles className="h-6 w-6 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{year} Wrapped</h3>
                    <p className="text-sm text-muted-foreground">
                      Your year in cinema
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-purple-400">{stats.movieCount}</div>
                  <div className="text-xs text-muted-foreground">films</div>
                </div>
              </div>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
