"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared";
import { useMovies } from "@/hooks";
import { formatCurrency } from "@/lib/formula";

export default function StatsPage() {
  const { movies, isLoading } = useMovies();

  const stats = useMemo(() => {
    if (movies.length === 0) {
      return null;
    }

    const year = new Date().getFullYear();
    const yearMovies = movies.filter(
      (m) => new Date(m.date).getFullYear() === year
    );

    // Basic stats
    const totalMovies = yearMovies.length;
    const totalSpend = yearMovies.reduce((sum, m) => sum + m.total_cost, 0);
    const avgCost = totalMovies > 0 ? totalSpend / totalMovies : 0;
    const avgRating =
      totalMovies > 0
        ? yearMovies.reduce((sum, m) => sum + (m.rating || 0), 0) / totalMovies
        : 0;

    // Format breakdown
    const formatCounts: Record<string, number> = {};
    yearMovies.forEach((m) => {
      const format = m.format?.name || "Unknown";
      formatCounts[format] = (formatCounts[format] || 0) + 1;
    });

    // Theater breakdown
    const theaterCounts: Record<string, { count: number; spend: number }> = {};
    yearMovies.forEach((m) => {
      const theater = m.theater?.name || "Unknown";
      if (!theaterCounts[theater]) {
        theaterCounts[theater] = { count: 0, spend: 0 };
      }
      theaterCounts[theater].count += 1;
      theaterCounts[theater].spend += m.total_cost;
    });

    // Monthly breakdown
    const monthlyData: Record<number, { count: number; spend: number }> = {};
    yearMovies.forEach((m) => {
      const month = new Date(m.date).getMonth();
      if (!monthlyData[month]) {
        monthlyData[month] = { count: 0, spend: 0 };
      }
      monthlyData[month].count += 1;
      monthlyData[month].spend += m.total_cost;
    });

    // Rating distribution
    const ratingDist: Record<number, number> = {};
    yearMovies.forEach((m) => {
      if (m.rating) {
        const bucket = Math.floor(m.rating);
        ratingDist[bucket] = (ratingDist[bucket] || 0) + 1;
      }
    });

    return {
      year,
      totalMovies,
      totalSpend,
      avgCost,
      avgRating,
      formatCounts,
      theaterCounts,
      monthlyData,
      ratingDist,
    };
  }, [movies]);

  return (
    <div className="min-h-screen">
      <PageHeader title="Statistics" />

      <div className="p-4">
        <Tabs defaultValue="overview">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
            <TabsTrigger value="spending" className="flex-1">Spending</TabsTrigger>
            <TabsTrigger value="ratings" className="flex-1">Ratings</TabsTrigger>
          </TabsList>

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-32" />
              <Skeleton className="h-40" />
            </div>
          ) : !stats ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-muted-foreground">No data yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Start logging movies to see your stats
              </p>
            </div>
          ) : (
            <>
              <TabsContent value="overview" className="space-y-4">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold text-primary">
                        {stats.totalMovies}
                      </p>
                      <p className="text-sm text-muted-foreground">Movies</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-3xl font-bold">
                        {stats.avgRating.toFixed(1)}
                      </p>
                      <p className="text-sm text-muted-foreground">Avg Rating</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Format Breakdown */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Formats</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(stats.formatCounts)
                        .sort((a, b) => b[1] - a[1])
                        .map(([format, count]) => (
                          <div key={format} className="flex items-center gap-3">
                            <div className="flex-1">
                              <div className="flex justify-between text-sm">
                                <span>{format}</span>
                                <span className="text-muted-foreground">{count}</span>
                              </div>
                              <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                                <div
                                  className="h-full bg-primary"
                                  style={{
                                    width: `${(count / stats.totalMovies) * 100}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Theaters */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Theaters</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(stats.theaterCounts)
                        .sort((a, b) => b[1].count - a[1].count)
                        .slice(0, 4)
                        .map(([theater, data]) => (
                          <div
                            key={theater}
                            className="rounded-lg bg-secondary/50 p-3"
                          >
                            <p className="truncate font-medium">{theater}</p>
                            <p className="text-sm text-muted-foreground">
                              {data.count} visits
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatCurrency(data.spend)} spent
                            </p>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="spending" className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-primary">
                        {formatCurrency(stats.totalSpend)}
                      </p>
                      <p className="text-sm text-muted-foreground">Total Spend</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">
                        {formatCurrency(stats.avgCost)}
                      </p>
                      <p className="text-sm text-muted-foreground">Avg per Movie</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Monthly Spending */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Monthly Spending</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Array.from({ length: 12 }, (_, i) => {
                        const data = stats.monthlyData[i] || { count: 0, spend: 0 };
                        const monthName = new Date(2000, i).toLocaleString("default", {
                          month: "short",
                        });
                        const maxSpend = Math.max(
                          ...Object.values(stats.monthlyData).map((d) => d.spend),
                          1
                        );

                        return (
                          <div key={i} className="flex items-center gap-3">
                            <span className="w-8 text-sm text-muted-foreground">
                              {monthName}
                            </span>
                            <div className="flex-1">
                              <div className="h-4 overflow-hidden rounded bg-secondary">
                                <div
                                  className="h-full bg-primary transition-all"
                                  style={{
                                    width: `${(data.spend / maxSpend) * 100}%`,
                                  }}
                                />
                              </div>
                            </div>
                            <span className="w-16 text-right text-sm">
                              {data.spend > 0 ? formatCurrency(data.spend) : "-"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="ratings" className="space-y-4">
                {/* Rating Distribution */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Rating Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end justify-between gap-1" style={{ height: "120px" }}>
                      {Array.from({ length: 10 }, (_, i) => {
                        const rating = i + 1;
                        const count = stats.ratingDist[rating] || 0;
                        const maxCount = Math.max(...Object.values(stats.ratingDist), 1);
                        const height = count > 0 ? (count / maxCount) * 100 : 0;

                        return (
                          <div key={rating} className="flex flex-1 flex-col items-center gap-1">
                            <div className="relative w-full flex-1">
                              <div
                                className="absolute bottom-0 w-full rounded-t bg-primary transition-all"
                                style={{ height: `${height}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{rating}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </div>
  );
}
