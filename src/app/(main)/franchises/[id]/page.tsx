"use client";

import { use } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared";
import { useFranchise } from "@/hooks";
import { formatCurrency, getRatingColor } from "@/lib/formula";
import { cn } from "@/lib/utils";

interface FranchiseDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function FranchiseDetailPage({ params }: FranchiseDetailPageProps) {
  const { id } = use(params);
  const { franchise, movies, isLoading } = useFranchise(id);

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="" showBack />
        <div className="space-y-4 p-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (!franchise) {
    return (
      <div className="min-h-screen">
        <PageHeader title="" showBack />
        <div className="flex min-h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">Franchise not found</p>
        </div>
      </div>
    );
  }

  const rated = movies.filter((m) => m.rating != null);
  const avgRating =
    rated.length > 0
      ? rated.reduce((sum, m) => sum + (m.rating || 0), 0) / rated.length
      : 0;
  const totalSpend = movies.reduce((sum, m) => sum + m.total_cost, 0);

  return (
    <div className="min-h-screen">
      <PageHeader title="" showBack />

      <div className="p-4">
        <h1 className="mb-4 text-2xl font-bold">{franchise.name}</h1>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-primary">{movies.length}</p>
              <p className="text-xs text-muted-foreground">Movies</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{avgRating.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Avg Rating</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{formatCurrency(totalSpend)}</p>
              <p className="text-xs text-muted-foreground">Total Spend</p>
            </CardContent>
          </Card>
        </div>

        {/* Timeline */}
        {movies.length > 0 ? (
          <div className="space-y-3">
            <h2 className="mb-3 font-semibold">Timeline</h2>
            {movies.map((movie, i) => (
              <Link
                key={movie.id}
                href={`/movies/${movie.id}`}
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-secondary/50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {i + 1}
                </div>
                {movie.poster_url ? (
                  <img
                    src={movie.poster_url}
                    alt={movie.title}
                    className="h-14 w-10 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-10 items-center justify-center rounded bg-secondary text-sm">
                    🎬
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{movie.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(movie.date).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {movie.format?.name && (
                      <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
                        {movie.format.name}
                      </Badge>
                    )}
                  </p>
                </div>
                {movie.rating && (
                  <span className={cn("text-lg font-bold", getRatingColor(movie.rating))}>
                    {movie.rating.toFixed(1)}
                  </span>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">No movies assigned yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Edit a movie and select this franchise
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
