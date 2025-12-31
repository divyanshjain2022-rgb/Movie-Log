"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
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

    const totalSpend = yearMovies.reduce((sum, m) => sum + m.total_cost, 0);
    const movieCount = yearMovies.length;
    const averageRating =
      movieCount > 0
        ? yearMovies.reduce((sum, m) => sum + (m.rating || 0), 0) / movieCount
        : 0;
    const greatCount = yearMovies.filter((m) => (m.rating || 0) >= 7).length;
    const mehCount = yearMovies.filter((m) => (m.rating || 0) < 6).length;
    const totalSaved = giftCards.reduce(
      (sum, gc) => sum + (gc.face_value - gc.amount_paid),
      0
    );

    return { totalSpend, movieCount, averageRating, greatCount, mehCount, totalSaved };
  }, [movies, giftCards, year]);

  const recentMovies = useMemo(() => {
    return [...movies]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [movies]);

  const isLoading = moviesLoading || giftCardsLoading;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <h1 className="text-xl font-bold text-primary">CinemaLog</h1>
        <div className="flex items-center gap-2">
          <Link href="/movies/new">
            <Button size="icon" className="h-9 w-9">
              <Plus className="h-5 w-5" />
            </Button>
          </Link>
          <Link href="/settings">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <Settings className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="space-y-6 p-4">
        {/* Year Summary */}
        {isLoading ? (
          <Skeleton className="h-[100px] w-full" />
        ) : (
          <SummaryCard
            year={year}
            totalSpend={stats.totalSpend}
            movieCount={stats.movieCount}
            averageRating={stats.averageRating}
          />
        )}

        {/* Quick Stats */}
        {isLoading ? (
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-[72px]" />
            <Skeleton className="h-[72px]" />
            <Skeleton className="h-[72px]" />
          </div>
        ) : (
          <QuickStats
            saved={stats.totalSaved}
            greatCount={stats.greatCount}
            mehCount={stats.mehCount}
          />
        )}

        {/* Recent Movies */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Recent</h2>
            <Link
              href="/movies"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              See all
            </Link>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-[80px]" />
              <Skeleton className="h-[80px]" />
            </div>
          ) : (
            <RecentMovies movies={recentMovies} />
          )}
        </section>

        {/* Gift Cards */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Gift Cards</h2>
            <Link
              href="/gift-cards"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Manage
            </Link>
          </div>
          {isLoading ? (
            <Skeleton className="h-[80px]" />
          ) : (
            <GCStatus giftCards={giftCards} />
          )}
        </section>
      </div>
    </div>
  );
}
