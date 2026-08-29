"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared";
import { useMovies } from "@/hooks";
import { formatCurrency, getRatingColor } from "@/lib/formula";
import { cn } from "@/lib/utils";
import { tmdbImage } from "@/lib/tmdb-image";

interface CrewPageProps {
  params: Promise<{ name: string }>;
}

export default function CrewPage({ params }: CrewPageProps) {
  const { name: encodedName } = use(params);
  const name = decodeURIComponent(encodedName);
  const { movies, isLoading } = useMovies();

  // Find all movies where this person was involved as crew
  const crewMovies = useMemo(() => {
    return movies.filter(
      (m) =>
        m.director === name ||
        (m.cast_members || []).includes(name) ||
        m.composer === name ||
        m.cinematographer === name
    );
  }, [movies, name]);

  // Determine roles
  const roles = useMemo(() => {
    const r: string[] = [];
    if (crewMovies.some((m) => m.director === name)) r.push("Director");
    if (crewMovies.some((m) => (m.cast_members || []).includes(name)))
      r.push("Actor");
    if (crewMovies.some((m) => m.composer === name)) r.push("Composer");
    if (crewMovies.some((m) => m.cinematographer === name))
      r.push("Cinematographer");
    return r;
  }, [crewMovies, name]);

  // Stats
  const stats = useMemo(() => {
    if (crewMovies.length === 0) return null;
    const rated = crewMovies.filter((m) => m.rating != null);
    const avgRating =
      rated.length > 0
        ? rated.reduce((sum, m) => sum + (m.rating || 0), 0) / rated.length
        : 0;
    const totalSpend = crewMovies.reduce((sum, m) => sum + m.total_cost, 0);

    // Format breakdown
    const formatCounts: Record<string, number> = {};
    crewMovies.forEach((m) => {
      const format = m.format?.name || "Unknown";
      formatCounts[format] = (formatCounts[format] || 0) + 1;
    });

    // Genre breakdown
    const genreCounts: Record<string, number> = {};
    crewMovies.forEach((m) => {
      (m.genres || []).forEach((g) => {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      });
    });

    return { avgRating, totalSpend, formatCounts, genreCounts };
  }, [crewMovies]);

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

  return (
    <div className="min-h-screen">
      <PageHeader title="" showBack />

      <div className="p-4">
        {/* Name & Roles */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{name}</h1>
          <div className="mt-1 flex flex-wrap gap-1">
            {roles.map((role) => (
              <Badge key={role} variant="secondary">
                {role}
              </Badge>
            ))}
          </div>
        </div>

        {crewMovies.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">No movies found</p>
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            {stats && (
              <div className="mb-6 grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-primary">
                      {crewMovies.length}
                    </p>
                    <p className="text-xs text-muted-foreground">Movies</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold">
                      {stats.avgRating.toFixed(1)}
                    </p>
                    <p className="text-xs text-muted-foreground">Avg Rating</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold">
                      {formatCurrency(stats.totalSpend)}
                    </p>
                    <p className="text-xs text-muted-foreground">Total Spend</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Format Breakdown */}
            {stats && Object.keys(stats.formatCounts).length > 1 && (
              <Card className="mb-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Formats</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(stats.formatCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([format, count]) => (
                        <Badge key={format} variant="outline">
                          {format}: {count}
                        </Badge>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Top Genres */}
            {stats && Object.keys(stats.genreCounts).length > 0 && (
              <Card className="mb-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Genres</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(stats.genreCounts)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 6)
                      .map(([genre, count]) => (
                        <Badge key={genre} variant="outline">
                          {genre}: {count}
                        </Badge>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Movie List */}
            <h2 className="mb-3 font-semibold">Filmography</h2>
            <div className="space-y-2">
              {crewMovies
                .sort(
                  (a, b) =>
                    new Date(b.date).getTime() - new Date(a.date).getTime()
                )
                .map((movie) => (
                  <Link
                    key={movie.id}
                    href={`/movies/${movie.id}`}
                    className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-secondary/50"
                  >
                    {movie.poster_url ? (
                      <img loading="lazy" decoding="async"
                        src={tmdbImage(movie.poster_url, "w185")}
                        alt={movie.title}
                        className="h-16 w-11 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-11 items-center justify-center rounded bg-secondary text-lg">
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
                        {movie.format?.name && ` \u2022 ${movie.format.name}`}
                      </p>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {movie.director === name && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            Director
                          </Badge>
                        )}
                        {(movie.cast_members || []).includes(name) && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            Actor
                          </Badge>
                        )}
                        {movie.composer === name && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            Composer
                          </Badge>
                        )}
                        {movie.cinematographer === name && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            DOP
                          </Badge>
                        )}
                      </div>
                    </div>
                    {movie.rating && (
                      <span
                        className={cn(
                          "text-lg font-bold",
                          getRatingColor(movie.rating)
                        )}
                      >
                        {movie.rating.toFixed(1)}
                      </span>
                    )}
                  </Link>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
