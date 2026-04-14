"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, YearFilter, type YearFilterValue } from "@/components/shared";
import { useMovies } from "@/hooks";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  ResponsiveContainer,
  Legend,
  Cell,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formula";

const CHART_COLORS = {
  amber: "var(--chart-1)",
  emerald: "var(--chart-2)",
  blue: "var(--chart-3)",
  violet: "var(--chart-4)",
  red: "var(--chart-5)",
  border: "var(--border)",
  card: "var(--card)",
  text: "var(--card-foreground)",
  muted: "var(--muted-foreground)",
};

const RATING_BUCKET_COLORS = [
  "#7f1d1d",
  "#991b1b",
  "#c2410c",
  "#ea580c",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
];

const AXIS_TICK = {
  fontSize: 11,
  fill: CHART_COLORS.muted,
};

const LEGEND_STYLE = {
  fontSize: 11,
  color: CHART_COLORS.muted,
};

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 12,
  border: `1px solid ${CHART_COLORS.border}`,
  backgroundColor: CHART_COLORS.card,
  color: CHART_COLORS.text,
};

function formatChartSeries(
  value: number | string,
  fallbackName: string | number,
  dataKey?: string | number
): [string, string] {
  const key = String(dataKey ?? fallbackName);

  if (key === "costPerMin") {
    return [`₹${Number(value).toFixed(2)}/min`, "Cost/Min"];
  }

  if (key === "avgRating") {
    return [Number(value).toFixed(1), "Avg Rating"];
  }

  if (key === "avgTicket") {
    return [`₹${value}`, "Avg Ticket"];
  }

  if (key === "avgTotal") {
    return [`₹${value}`, "Avg Total"];
  }

  return [String(value), String(fallbackName)];
}

export default function StatsPage() {
  const { movies, isLoading } = useMovies();
  const [selectedYear, setSelectedYear] = useState<YearFilterValue>(new Date().getFullYear());
  const [selectedFormat, setSelectedFormat] = useState<string>("all");
  const [selectedTheater, setSelectedTheater] = useState<string>("all");

  const availableYears = useMemo(() => {
    const years = [...new Set(movies.map((m) => new Date(m.date).getFullYear()))].sort((a, b) => b - a);
    return years.length > 0 ? years : [new Date().getFullYear()];
  }, [movies]);

  useEffect(() => {
    if (selectedYear !== "all" && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  // Price fluctuation data for Insights tab
  const priceFluctuation = useMemo(() => {
    if (movies.length === 0) return null;

    const yearMovies = selectedYear === "all"
      ? movies
      : movies.filter((m) => new Date(m.date).getFullYear() === selectedYear);

    // Get unique formats and theaters
    const formats = [...new Set(yearMovies.map((m) => m.format?.name).filter(Boolean))] as string[];
    const theaters = [...new Set(yearMovies.map((m) => m.theater?.name).filter(Boolean))] as string[];

    // Filter movies based on selections
    let filtered = yearMovies;
    if (selectedFormat !== "all") {
      filtered = filtered.filter((m) => m.format?.name === selectedFormat);
    }
    if (selectedTheater !== "all") {
      filtered = filtered.filter((m) => m.theater?.name === selectedTheater);
    }

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // By day of week
    const byDay: Record<string, { prices: number[]; total: number; count: number }> = {};
    dayNames.forEach((d) => { byDay[d] = { prices: [], total: 0, count: 0 }; });
    filtered.forEach((m) => {
      const day = dayNames[new Date(m.date).getDay()];
      const price = m.ticket_cost || 0;
      byDay[day].prices.push(price);
      byDay[day].total += price;
      byDay[day].count += 1;
    });
    const dayData = dayNames.map((day) => ({
      day,
      avg: byDay[day].count > 0 ? Math.round(byDay[day].total / byDay[day].count) : 0,
      min: byDay[day].prices.length > 0 ? Math.min(...byDay[day].prices) : 0,
      max: byDay[day].prices.length > 0 ? Math.max(...byDay[day].prices) : 0,
      count: byDay[day].count,
    }));

    // By time of day (scatter: each movie as a point)
    const timeData = filtered
      .filter((m) => m.showtime)
      .map((m) => {
        const [h, min] = (m.showtime || "12:00").split(":").map(Number);
        const hourDecimal = h + (min || 0) / 60;
        return {
          time: hourDecimal,
          timeLabel: `${h}:${String(min || 0).padStart(2, "0")}`,
          price: m.ticket_cost || 0,
          title: m.title,
          format: m.format?.name || "—",
          theater: m.theater?.name || "—",
        };
      })
      .sort((a, b) => a.time - b.time);

    // By time slot (grouped averages)
    const timeSlots = [
      { label: "Morning", min: 0, max: 12 },
      { label: "Afternoon", min: 12, max: 16 },
      { label: "Evening", min: 16, max: 20 },
      { label: "Night", min: 20, max: 24 },
    ];
    const timeSlotData = timeSlots.map((slot) => {
      const slotMovies = timeData.filter((m) => m.time >= slot.min && m.time < slot.max);
      return {
        slot: slot.label,
        avg: slotMovies.length > 0 ? Math.round(slotMovies.reduce((s, m) => s + m.price, 0) / slotMovies.length) : 0,
        count: slotMovies.length,
      };
    });

    return { formats, theaters, dayData, timeData, timeSlotData, totalFiltered: filtered.length };
  }, [movies, selectedYear, selectedFormat, selectedTheater]);

  useEffect(() => {
    if (!priceFluctuation) return;

    if (selectedFormat !== "all" && !priceFluctuation.formats.includes(selectedFormat)) {
      setSelectedFormat("all");
    }

    if (selectedTheater !== "all" && !priceFluctuation.theaters.includes(selectedTheater)) {
      setSelectedTheater("all");
    }
  }, [priceFluctuation, selectedFormat, selectedTheater]);

  const stats = useMemo(() => {
    if (movies.length === 0) {
      return null;
    }

    const yearMovies = selectedYear === "all"
      ? movies
      : movies.filter((m) => new Date(m.date).getFullYear() === selectedYear);

    // Basic stats
    const totalMovies = yearMovies.length;
    const totalSpend = yearMovies.reduce((sum, m) => sum + m.total_cost, 0);
    const avgCost = totalMovies > 0 ? totalSpend / totalMovies : 0;
    const ratedMovies = yearMovies.filter((m) => typeof m.rating === "number" && m.rating > 0);
    const avgRating =
      ratedMovies.length > 0
        ? ratedMovies.reduce((sum, m) => sum + (m.rating || 0), 0) / ratedMovies.length
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
    ratedMovies.forEach((m) => {
      if (m.rating) {
        const bucket = Math.max(1, Math.min(10, Math.round(m.rating)));
        ratingDist[bucket] = (ratingDist[bucket] || 0) + 1;
      }
    });

    const ratingDistribution = Array.from({ length: 10 }, (_, i) => {
      const rating = i + 1;

      return {
        rating,
        count: ratingDist[rating] || 0,
        fill: RATING_BUCKET_COLORS[i],
      };
    });

    const topRatingBucket = ratingDistribution.reduce(
      (best, current) => (current.count > best.count ? current : best),
      ratingDistribution[0]
    );

    // Genre breakdown
    const genreCounts: Record<string, number> = {};
    yearMovies.forEach((m) => {
      (m.genres || []).forEach((g) => {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      });
    });

    // Day of week breakdown
    const dayOfWeekCounts: Record<string, number> = {};
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    yearMovies.forEach((m) => {
      const day = dayNames[new Date(m.date).getDay()];
      dayOfWeekCounts[day] = (dayOfWeekCounts[day] || 0) + 1;
    });

    // Director leaderboard
    const directorCounts: Record<string, number> = {};
    yearMovies.forEach((m) => {
      if (m.director) {
        directorCounts[m.director] = (directorCounts[m.director] || 0) + 1;
      }
    });

    // Your rating vs TMDB rating
    const ratingComparisons = yearMovies
      .filter((m) => m.rating && m.tmdb_rating)
      .map((m) => ({
        title: m.title,
        yours: m.rating!,
        tmdb: m.tmdb_rating!,
        diff: m.rating! - m.tmdb_rating!,
      }));

    // F&B stats
    const totalFnb = yearMovies.reduce((sum, m) => sum + (m.fnb_cost || 0), 0);
    const fnbPercent = totalSpend > 0 ? (totalFnb / totalSpend) * 100 : 0;

    // Passport savings
    const totalPassportSavings = yearMovies.reduce((sum, m) => sum + (m.passport_savings || 0), 0);

    // Cost per minute
    const totalMinutes = yearMovies.reduce((sum, m) => sum + (m.runtime_minutes || 0), 0);
    const costPerMinute = totalMinutes > 0 ? totalSpend / totalMinutes : 0;

    // Monthly summaries (matching spreadsheet style)
    const monthlySummaries = Array.from({ length: 12 }, (_, i) => {
      const monthMovies = yearMovies.filter((m) => new Date(m.date).getMonth() === i);
      return {
        month: i,
        movieCount: monthMovies.length,
        ticketCost: monthMovies.reduce((sum, m) => sum + m.ticket_cost, 0),
        passportSavings: monthMovies.reduce((sum, m) => sum + (m.passport_savings || 0), 0),
        fnbCost: monthMovies.reduce((sum, m) => sum + (m.fnb_cost || 0), 0),
        totalCost: monthMovies.reduce((sum, m) => sum + m.total_cost, 0),
        otherExpenses: monthMovies.reduce((sum, m) => sum + (m.other_expenses || 0), 0),
      };
    }).filter((s) => s.movieCount > 0);

    // Cost per minute per format (grouped bar chart data)
    const formatDetailsMap: Record<string, { totalCost: number; totalMin: number; totalRating: number; ratedCount: number; count: number }> = {};
    yearMovies.forEach((m) => {
      const format = m.format?.name || "Unknown";
      if (!formatDetailsMap[format]) {
        formatDetailsMap[format] = { totalCost: 0, totalMin: 0, totalRating: 0, ratedCount: 0, count: 0 };
      }
      formatDetailsMap[format].totalCost += m.total_cost;
      formatDetailsMap[format].totalMin += m.runtime_minutes || 0;
      formatDetailsMap[format].count += 1;
      if (m.rating) {
        formatDetailsMap[format].totalRating += m.rating;
        formatDetailsMap[format].ratedCount += 1;
      }
    });
    const costPerMinuteByFormat = Object.entries(formatDetailsMap)
      .map(([format, d]) => ({
        format,
        costPerMin: d.totalMin > 0 ? +(d.totalCost / d.totalMin).toFixed(2) : 0,
        avgRating: d.ratedCount > 0 ? +(d.totalRating / d.ratedCount).toFixed(1) : 0,
        count: d.count,
      }))
      .sort((a, b) => b.count - a.count);

    // Price trends - avg ticket cost per month (line chart)
    const priceTrends = Array.from({ length: 12 }, (_, i) => {
      const monthMovies = yearMovies.filter((m) => new Date(m.date).getMonth() === i);
      const avgTicket = monthMovies.length > 0
        ? monthMovies.reduce((sum, m) => sum + m.ticket_cost, 0) / monthMovies.length
        : 0;
      const avgTotal = monthMovies.length > 0
        ? monthMovies.reduce((sum, m) => sum + m.total_cost, 0) / monthMovies.length
        : 0;
      return {
        month: new Date(2000, i).toLocaleString("default", { month: "short" }),
        avgTicket: +avgTicket.toFixed(0),
        avgTotal: +avgTotal.toFixed(0),
        count: monthMovies.length,
      };
    }).filter((d) => d.count > 0);

    return {
      totalMovies,
      totalSpend,
      avgCost,
      avgRating,
      formatCounts,
      theaterCounts,
      monthlyData,
      ratingDist,
      ratingDistribution,
      ratedMoviesCount: ratedMovies.length,
      topRatingBucket,
      genreCounts,
      dayOfWeekCounts,
      directorCounts,
      ratingComparisons,
      totalFnb,
      fnbPercent,
      totalPassportSavings,
      costPerMinute,
      monthlySummaries,
      costPerMinuteByFormat,
      priceTrends,
    };
  }, [movies, selectedYear]);

  return (
    <div className="min-h-screen">
      <PageHeader title="Statistics" />

      <div className="p-4">
        <YearFilter
          years={availableYears}
          value={selectedYear}
          onChange={setSelectedYear}
          className="mb-3"
        />

        <Tabs defaultValue="overview">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
            <TabsTrigger value="spending" className="flex-1">Spending</TabsTrigger>
            <TabsTrigger value="ratings" className="flex-1">Ratings</TabsTrigger>
            <TabsTrigger value="insights" className="flex-1">Insights</TabsTrigger>
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
                {/* Genre Breakdown */}
                {Object.keys(stats.genreCounts).length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Genres</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {Object.entries(stats.genreCounts)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 8)
                          .map(([genre, count]) => (
                            <div key={genre} className="flex items-center gap-3">
                              <div className="flex-1">
                                <div className="flex justify-between text-sm">
                                  <span>{genre}</span>
                                  <span className="text-muted-foreground">{count}</span>
                                </div>
                                <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                                  <div
                                    className="h-full bg-primary/70"
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
                )}

                {/* Day of Week */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Day of Week</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => {
                        const fullDay = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i];
                        const count = stats.dayOfWeekCounts[fullDay] || 0;
                        const maxDow = Math.max(...Object.values(stats.dayOfWeekCounts), 1);
                        return (
                          <div key={day} className="flex flex-col items-center gap-1">
                            <div className="h-16 w-full flex items-end justify-center">
                              <div
                                className="w-full max-w-6 rounded-t bg-primary"
                                style={{ height: `${count > 0 ? (count / maxDow) * 100 : 0}%`, minHeight: count > 0 ? '4px' : '0' }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{day}</span>
                            {count > 0 && <span className="text-xs font-medium">{count}</span>}
                          </div>
                        );
                      })}
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

                {/* Extra Spending Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-lg font-bold">{formatCurrency(stats.totalFnb)}</p>
                      <p className="text-xs text-muted-foreground">F&B ({stats.fnbPercent.toFixed(0)}%)</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-lg font-bold text-positive">{formatCurrency(stats.totalPassportSavings)}</p>
                      <p className="text-xs text-muted-foreground">Passport Savings</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-lg font-bold">{formatCurrency(stats.costPerMinute)}</p>
                      <p className="text-xs text-muted-foreground">Cost/Min</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Cost per Minute by Format */}
                {stats.costPerMinuteByFormat.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Cost/Min by Format</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={stats.costPerMinuteByFormat}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} vertical={false} />
                          <XAxis
                            dataKey="format"
                            tick={AXIS_TICK}
                            tickLine={false}
                            axisLine={false}
                            interval={0}
                            angle={-18}
                            textAnchor="end"
                            height={56}
                          />
                          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} />
                          <Tooltip
                            formatter={(value, name, item) =>
                              formatChartSeries(
                                value as number | string,
                                name,
                                (item && "dataKey" in item ? item.dataKey : undefined) as
                                  | string
                                  | number
                                  | undefined
                              )
                            }
                            labelFormatter={(label, payload) => {
                              const count = payload?.[0]?.payload?.count;
                              return count ? `${label} · ${count} movies` : label;
                            }}
                            contentStyle={TOOLTIP_STYLE}
                          />
                          <Legend wrapperStyle={LEGEND_STYLE} iconType="circle" />
                          <Bar dataKey="costPerMin" fill={CHART_COLORS.amber} name="Cost/Min" radius={[6, 6, 0, 0]} />
                          <Bar dataKey="avgRating" fill={CHART_COLORS.blue} name="Avg Rating" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Price Trends */}
                {stats.priceTrends.length > 1 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Price Trends</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={stats.priceTrends}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} vertical={false} />
                          <XAxis dataKey="month" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} />
                          <Tooltip
                            formatter={(value, name, item) =>
                              formatChartSeries(
                                value as number | string,
                                name,
                                (item && "dataKey" in item ? item.dataKey : undefined) as
                                  | string
                                  | number
                                  | undefined
                              )
                            }
                            labelFormatter={(label, payload) => {
                              const count = payload?.[0]?.payload?.count;
                              return count ? `${label} · ${count} movies` : label;
                            }}
                            contentStyle={TOOLTIP_STYLE}
                          />
                          <Legend wrapperStyle={LEGEND_STYLE} iconType="circle" />
                          <Line
                            type="monotone"
                            dataKey="avgTicket"
                            stroke={CHART_COLORS.amber}
                            name="Avg Ticket"
                            strokeWidth={2.5}
                            dot={{ r: 3, fill: CHART_COLORS.amber, strokeWidth: 0 }}
                            activeDot={{ r: 5, fill: CHART_COLORS.amber, strokeWidth: 0 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="avgTotal"
                            stroke={CHART_COLORS.blue}
                            name="Avg Total"
                            strokeWidth={2.5}
                            dot={{ r: 3, fill: CHART_COLORS.blue, strokeWidth: 0 }}
                            activeDot={{ r: 5, fill: CHART_COLORS.blue, strokeWidth: 0 }}
                            strokeDasharray="6 6"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Monthly Summaries (spreadsheet style) */}
                {stats.monthlySummaries.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Monthly Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {stats.monthlySummaries.map((s) => {
                          const monthName = new Date(2000, s.month).toLocaleString("default", { month: "long" });
                          return (
                            <div key={s.month} className="rounded-lg bg-secondary/30 p-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium">{monthName}</span>
                                <span className="text-sm text-muted-foreground">{s.movieCount} movies</span>
                              </div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                                <span>Tickets: {formatCurrency(s.ticketCost)}</span>
                                <span>F&B: {formatCurrency(s.fnbCost)}</span>
                                <span>Total: {formatCurrency(s.totalCost)}</span>
                                {s.passportSavings > 0 && <span className="text-positive">Saved: {formatCurrency(s.passportSavings)}</span>}
                                {s.otherExpenses > 0 && <span>Other: {formatCurrency(s.otherExpenses)}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

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
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Rating Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {stats.ratedMoviesCount === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border/80 bg-secondary/20 px-4 py-10 text-center">
                        <p className="text-sm font-medium">No ratings logged yet</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Rate a few movies to unlock your distribution.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="rounded-2xl bg-secondary/30 p-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/55">
                              Rated Movies
                            </p>
                            <p className="mt-2 text-2xl font-semibold">{stats.ratedMoviesCount}</p>
                          </div>
                          <div className="rounded-2xl bg-secondary/30 p-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/55">
                              Peak Bucket
                            </p>
                            <p className="mt-2 text-2xl font-semibold">{stats.topRatingBucket.rating}</p>
                          </div>
                          <div className="rounded-2xl bg-secondary/30 p-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/55">
                              Avg Rating
                            </p>
                            <p className="mt-2 text-2xl font-semibold">{stats.avgRating.toFixed(1)}</p>
                          </div>
                        </div>

                        <ResponsiveContainer width="100%" height={240}>
                          <BarChart data={stats.ratingDistribution}>
                            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} vertical={false} />
                            <XAxis
                              dataKey="rating"
                              tick={AXIS_TICK}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              allowDecimals={false}
                              tick={AXIS_TICK}
                              tickLine={false}
                              axisLine={false}
                            />
                            <Tooltip
                              formatter={(value: number) => [
                                `${value} ${value === 1 ? "movie" : "movies"}`,
                                "Count",
                              ]}
                              labelFormatter={(label) => `Rating ${label}`}
                              contentStyle={TOOLTIP_STYLE}
                            />
                            <ReferenceLine
                              x={Math.round(stats.avgRating)}
                              stroke={CHART_COLORS.muted}
                              strokeDasharray="4 4"
                            />
                            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                              {stats.ratingDistribution.map((entry) => (
                                <Cell key={entry.rating} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="insights" className="space-y-4">
                {/* Ticket Price Fluctuation */}
                {priceFluctuation && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Ticket Price Fluctuation</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Filters */}
                      <div className="space-y-2">
                        <div>
                          <p className="mb-1.5 text-[11px] font-medium text-muted-foreground/50">Format</p>
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              onClick={() => setSelectedFormat("all")}
                              className={cn(
                                "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                                selectedFormat === "all"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                              )}
                            >
                              All
                            </button>
                            {priceFluctuation.formats.map((f) => (
                              <button
                                key={f}
                                onClick={() => setSelectedFormat(f)}
                                className={cn(
                                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                                  selectedFormat === f
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                                )}
                              >
                                {f}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="mb-1.5 text-[11px] font-medium text-muted-foreground/50">Theater</p>
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              onClick={() => setSelectedTheater("all")}
                              className={cn(
                                "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                                selectedTheater === "all"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                              )}
                            >
                              All
                            </button>
                            {priceFluctuation.theaters.map((t) => (
                              <button
                                key={t}
                                onClick={() => setSelectedTheater(t)}
                                className={cn(
                                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                                  selectedTheater === t
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                                )}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {priceFluctuation.totalFiltered === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground/50">No movies match this filter</p>
                      ) : (
                        <>
                          {/* By Day of Week */}
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">Avg Ticket by Day of Week</p>
                            <ResponsiveContainer width="100%" height={180}>
                              <BarChart data={priceFluctuation.dayData}>
                                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} vertical={false} />
                                <XAxis dataKey="day" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} />
                                <Tooltip
                                  content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null;
                                    const d = payload[0].payload;
                                    if (d.count === 0) return null;
                                    return (
                                      <div className="rounded-lg border border-border bg-card p-2 text-xs shadow-lg">
                                        <p className="font-medium">{d.day}</p>
                                        <p>Avg: ₹{d.avg}</p>
                                        <p>Range: ₹{d.min} – ₹{d.max}</p>
                                        <p className="text-muted-foreground">{d.count} {d.count === 1 ? "movie" : "movies"}</p>
                                      </div>
                                    );
                                  }}
                                />
                                <Bar dataKey="avg" fill={CHART_COLORS.blue} radius={[6, 6, 0, 0]}>
                                  {priceFluctuation.dayData.map((entry, i) => (
                                    <Cell key={i} fill={CHART_COLORS.blue} opacity={entry.count > 0 ? 1 : 0.15} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>

                          {/* By Time Slot */}
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">Avg Ticket by Time of Day</p>
                            <ResponsiveContainer width="100%" height={160}>
                              <BarChart data={priceFluctuation.timeSlotData}>
                                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} vertical={false} />
                                <XAxis dataKey="slot" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} />
                                <Tooltip
                                  content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null;
                                    const d = payload[0].payload;
                                    if (d.count === 0) return null;
                                    return (
                                      <div className="rounded-lg border border-border bg-card p-2 text-xs shadow-lg">
                                        <p className="font-medium">{d.slot}</p>
                                        <p>Avg: ₹{d.avg}</p>
                                        <p className="text-muted-foreground">{d.count} {d.count === 1 ? "movie" : "movies"}</p>
                                      </div>
                                    );
                                  }}
                                />
                                <Bar dataKey="avg" fill={CHART_COLORS.violet} radius={[6, 6, 0, 0]}>
                                  {priceFluctuation.timeSlotData.map((entry, i) => (
                                    <Cell key={i} fill={CHART_COLORS.violet} opacity={entry.count > 0 ? 1 : 0.15} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>

                          {/* Individual Movie Scatter */}
                          {priceFluctuation.timeData.length > 0 && (
                            <div>
                              <p className="mb-2 text-xs font-medium text-muted-foreground">Each Movie by Showtime</p>
                              <ResponsiveContainer width="100%" height={180}>
                                <ScatterChart>
                                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} />
                                  <XAxis
                                    dataKey="time"
                                    type="number"
                                    domain={[8, 24]}
                                    tick={AXIS_TICK}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(v) => `${Math.floor(v)}:00`}
                                    label={{ value: "Showtime", position: "insideBottom", offset: -2, fontSize: 10, fill: CHART_COLORS.muted }}
                                  />
                                  <YAxis
                                    dataKey="price"
                                    tick={AXIS_TICK}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(v) => `₹${v}`}
                                  />
                                  <Tooltip
                                    content={({ active, payload }) => {
                                      if (!active || !payload?.length) return null;
                                      const d = payload[0].payload;
                                      return (
                                        <div className="rounded-lg border border-border bg-card p-2 text-xs shadow-lg">
                                          <p className="font-medium">{d.title}</p>
                                          <p>₹{d.price} at {d.timeLabel}</p>
                                          <p className="text-muted-foreground">{d.format} · {d.theater}</p>
                                        </div>
                                      );
                                    }}
                                  />
                                  <Scatter data={priceFluctuation.timeData} fill={CHART_COLORS.emerald} />
                                </ScatterChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Your Rating vs TMDB */}
                {stats.ratingComparisons.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Your Rating vs TMDB</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {stats.ratingComparisons
                          .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
                          .slice(0, 10)
                          .map((r, i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                              <span className="flex-1 truncate">{r.title}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{r.yours.toFixed(1)}</span>
                                <span className="text-muted-foreground">vs</span>
                                <span className="text-muted-foreground">{r.tmdb.toFixed(1)}</span>
                                <span className={r.diff > 0 ? "text-positive text-xs" : r.diff < 0 ? "text-negative text-xs" : "text-xs"}>
                                  {r.diff > 0 ? "+" : ""}{r.diff.toFixed(1)}
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                      {stats.ratingComparisons.length > 0 && (
                        <div className="mt-3 rounded-lg bg-secondary/30 p-2 text-center text-sm">
                          You rate{" "}
                          {(() => {
                            const avgDiff = stats.ratingComparisons.reduce((sum, r) => sum + r.diff, 0) / stats.ratingComparisons.length;
                            return avgDiff > 0.3
                              ? <span className="font-medium text-positive">{avgDiff.toFixed(1)} higher</span>
                              : avgDiff < -0.3
                              ? <span className="font-medium text-negative">{Math.abs(avgDiff).toFixed(1)} lower</span>
                              : <span className="font-medium">about the same</span>;
                          })()}{" "}
                          than TMDB average
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Director Leaderboard */}
                {Object.keys(stats.directorCounts).length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Directors Watched</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {Object.entries(stats.directorCounts)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 8)
                          .map(([director, count]) => (
                            <div key={director} className="flex justify-between text-sm">
                              <span>{director}</span>
                              <span className="text-muted-foreground">{count} {count === 1 ? "movie" : "movies"}</span>
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </div>
  );
}
