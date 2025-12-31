"use client";

import { useMemo } from "react";
import {
    Film,
    DollarSign,
    Star,
    TrendingUp,
    Calendar,
    Award,
    Sparkles
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared";
import { useMovies } from "@/hooks";
import { formatCurrency } from "@/lib/formula";
import { cn } from "@/lib/utils";

export default function YearWrappedPage() {
    const { movies, isLoading } = useMovies();

    const stats = useMemo(() => {
        if (!movies.length) return null;

        const currentYear = new Date().getFullYear();
        const yearMovies = movies.filter(
            (m) => new Date(m.date).getFullYear() === currentYear
        );

        if (!yearMovies.length) return null;

        // Total stats
        const totalMovies = yearMovies.length;
        const totalSpent = yearMovies.reduce(
            (sum, m) => sum + (m.total_cost || 0),
            0
        );
        const avgRating =
            yearMovies.reduce((sum, m) => sum + (m.rating || 0), 0) / totalMovies;

        // Top rated movie
        const topRated = [...yearMovies].sort(
            (a, b) => (b.rating || 0) - (a.rating || 0)
        )[0];

        // Most expensive outing
        const mostExpensive = [...yearMovies].sort(
            (a, b) => (b.total_cost || 0) - (a.total_cost || 0)
        )[0];

        // Format breakdown
        const formatCounts: Record<string, number> = {};
        yearMovies.forEach((m) => {
            const format = m.format?.name || "Unknown";
            formatCounts[format] = (formatCounts[format] || 0) + 1;
        });
        const topFormat = Object.entries(formatCounts).sort(
            ([, a], [, b]) => b - a
        )[0];

        // Theater breakdown
        const theaterCounts: Record<string, number> = {};
        yearMovies.forEach((m) => {
            const theater = m.theater?.name || "Unknown";
            theaterCounts[theater] = (theaterCounts[theater] || 0) + 1;
        });
        const topTheater = Object.entries(theaterCounts).sort(
            ([, a], [, b]) => b - a
        )[0];

        // Monthly distribution
        const monthlyCount = new Array(12).fill(0);
        yearMovies.forEach((m) => {
            const month = new Date(m.date).getMonth();
            monthlyCount[month]++;
        });
        const busiestMonth = monthlyCount.indexOf(Math.max(...monthlyCount));
        const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];

        // Mood analysis
        const moodCounts: Record<string, number> = {};
        yearMovies.forEach((m) => {
            if (m.mood?.name) {
                moodCounts[m.mood.name] = (moodCounts[m.mood.name] || 0) + 1;
            }
        });
        const topMood = Object.entries(moodCounts).sort(
            ([, a], [, b]) => b - a
        )[0];

        return {
            year: currentYear,
            totalMovies,
            totalSpent,
            avgRating,
            topRated,
            mostExpensive,
            topFormat,
            topTheater,
            busiestMonth: monthNames[busiestMonth],
            monthlyCount,
            topMood,
        };
    }, [movies]);

    if (isLoading) {
        return (
            <div className="min-h-screen">
                <PageHeader title="Year Wrapped" showBack />
                <div className="space-y-4 p-4">
                    <Skeleton className="h-40" />
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                </div>
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="min-h-screen">
                <PageHeader title="Year Wrapped" showBack />
                <div className="flex min-h-[60vh] items-center justify-center p-4">
                    <div className="text-center">
                        <Sparkles className="mx-auto h-16 w-16 text-muted-foreground" />
                        <p className="mt-4 text-lg font-medium">No movies logged this year</p>
                        <p className="mt-1 text-muted-foreground">
                            Start logging movies to see your year wrapped!
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const StatCard = ({
        icon: Icon,
        label,
        value,
        subValue,
        accent = false,
    }: {
        icon: React.ElementType;
        label: string;
        value: string | number;
        subValue?: string;
        accent?: boolean;
    }) => (
        <Card className={cn(accent && "border-primary/50 bg-primary/5")}>
            <CardContent className="flex items-center gap-4 p-4">
                <div
                    className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-full",
                        accent ? "bg-primary text-primary-foreground" : "bg-secondary"
                    )}
                >
                    <Icon className="h-6 w-6" />
                </div>
                <div>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="text-2xl font-bold">{value}</p>
                    {subValue && <p className="text-sm text-muted-foreground">{subValue}</p>}
                </div>
            </CardContent>
        </Card>
    );

    return (
        <div className="min-h-screen">
            <PageHeader title={`${stats.year} Wrapped`} showBack />

            <div className="space-y-4 p-4">
                {/* Hero Stats */}
                <div className="rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-6 text-center">
                    <Sparkles className="mx-auto h-8 w-8 text-primary" />
                    <p className="mt-2 text-sm text-muted-foreground">This year you watched</p>
                    <p className="mt-1 text-6xl font-bold text-primary">{stats.totalMovies}</p>
                    <p className="text-lg font-medium">movies</p>
                </div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                    <StatCard
                        icon={DollarSign}
                        label="Total Spent"
                        value={formatCurrency(stats.totalSpent)}
                    />
                    <StatCard
                        icon={Star}
                        label="Avg Rating"
                        value={stats.avgRating.toFixed(1)}
                        subValue="out of 10"
                    />
                </div>

                {/* Top Movie */}
                {stats.topRated && (
                    <Card className="overflow-hidden">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Award className="h-4 w-4 text-primary" />
                                Highest Rated
                            </div>
                            <div className="mt-3 flex gap-3">
                                {stats.topRated.poster_url ? (
                                    <img
                                        src={stats.topRated.poster_url}
                                        alt={stats.topRated.title}
                                        className="h-24 w-16 rounded-lg object-cover"
                                    />
                                ) : (
                                    <div className="flex h-24 w-16 items-center justify-center rounded-lg bg-secondary text-2xl">
                                        🎬
                                    </div>
                                )}
                                <div>
                                    <p className="font-semibold">{stats.topRated.title}</p>
                                    <div className="mt-1 flex items-center gap-1">
                                        <Star className="h-4 w-4 fill-primary text-primary" />
                                        <span className="font-bold text-primary">
                                            {stats.topRated.rating}/10
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Insights */}
                <div className="space-y-3">
                    <h2 className="text-sm font-medium text-muted-foreground">Your Insights</h2>

                    <StatCard
                        icon={Film}
                        label="Favorite Format"
                        value={stats.topFormat?.[0] || "N/A"}
                        subValue={stats.topFormat ? `${stats.topFormat[1]} movies` : undefined}
                        accent
                    />

                    <StatCard
                        icon={Calendar}
                        label="Busiest Month"
                        value={stats.busiestMonth}
                        subValue={`${stats.monthlyCount[new Date(`${stats.busiestMonth} 1`).getMonth()]} movies`}
                    />

                    {stats.topTheater && (
                        <StatCard
                            icon={TrendingUp}
                            label="Most Visited Theater"
                            value={stats.topTheater[0]}
                            subValue={`${stats.topTheater[1]} visits`}
                        />
                    )}

                    {stats.topMood && (
                        <Card>
                            <CardContent className="p-4">
                                <p className="text-sm text-muted-foreground">Most Common Mood</p>
                                <div className="mt-2 flex items-center gap-2">
                                    <Badge variant="secondary" className="text-lg">
                                        {stats.topMood[0]}
                                    </Badge>
                                    <span className="text-sm text-muted-foreground">
                                        {stats.topMood[1]} times
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Monthly Chart */}
                <Card>
                    <CardContent className="p-4">
                        <p className="text-sm font-medium text-muted-foreground">Monthly Activity</p>
                        <div className="mt-4 flex h-20 items-end gap-1">
                            {stats.monthlyCount.map((count, i) => (
                                <div
                                    key={i}
                                    className="flex-1 rounded-t bg-primary/30 transition-all hover:bg-primary/50"
                                    style={{
                                        height: `${Math.max(10, (count / Math.max(...stats.monthlyCount)) * 100)}%`,
                                    }}
                                    title={`${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i]}: ${count}`}
                                />
                            ))}
                        </div>
                        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                            <span>Jan</span>
                            <span>Jun</span>
                            <span>Dec</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
