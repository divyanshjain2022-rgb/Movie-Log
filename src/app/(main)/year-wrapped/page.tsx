"use client";

import { useMemo, useState } from "react";
import {
    Film,
    DollarSign,
    Star,
    TrendingUp,
    Calendar,
    Award,
    Sparkles,
    Clock,
    Clapperboard,
    Music,
    Globe,
    Shield,
    CreditCard,
    ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared";
import { useMovies, useGiftCards } from "@/hooks";
import { formatCurrency } from "@/lib/formula";
import { cn } from "@/lib/utils";

export default function YearWrappedPage() {
    const { movies, isLoading: moviesLoading } = useMovies();
    const { giftCards, isLoading: giftCardsLoading } = useGiftCards();
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    const availableYears = useMemo(() => {
        const years = [...new Set(movies.map((m) => new Date(m.date).getFullYear()))].sort((a, b) => b - a);
        return years.length > 0 ? years : [new Date().getFullYear()];
    }, [movies]);

    const stats = useMemo(() => {
        if (!movies.length) return null;

        const yearMovies = movies.filter(
            (m) => new Date(m.date).getFullYear() === selectedYear
        );

        if (!yearMovies.length) return null;

        // Basic stats
        const totalMovies = yearMovies.length;
        const totalSpent = yearMovies.reduce(
            (sum, m) => sum + (m.total_cost || 0),
            0
        );
        const ratedMovies = yearMovies.filter((m) => m.rating != null && m.rating > 0);
        const avgRating =
            ratedMovies.length > 0
                ? ratedMovies.reduce((sum, m) => sum + (m.rating || 0), 0) / ratedMovies.length
                : 0;

        // Total runtime
        const totalRuntime = yearMovies.reduce(
            (sum, m) => sum + (m.runtime_minutes || 0),
            0
        );

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
            "July", "August", "September", "October", "November", "December",
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

        // --- New stats ---

        // Genre breakdown
        const genreCounts: Record<string, number> = {};
        yearMovies.forEach((m) => {
            (m.genres || []).forEach((g) => {
                genreCounts[g] = (genreCounts[g] || 0) + 1;
            });
        });
        const topGenres = Object.entries(genreCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);

        // Director leaderboard
        const directorCounts: Record<string, number> = {};
        yearMovies.forEach((m) => {
            if (m.director) {
                directorCounts[m.director] = (directorCounts[m.director] || 0) + 1;
            }
        });
        const topDirectors = Object.entries(directorCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);
        const favoriteDirector = topDirectors[0];

        // Language breakdown
        const langCounts: Record<string, number> = {};
        yearMovies.forEach((m) => {
            if (m.language) {
                langCounts[m.language] = (langCounts[m.language] || 0) + 1;
            }
        });
        const topLanguages = Object.entries(langCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);

        // Rating vs TMDB tendency
        const moviesWithBothRatings = yearMovies.filter(
            (m) => m.rating && m.tmdb_rating
        );
        let ratingTendency: { avg_yours: number; avg_tmdb: number; delta: number } | null = null;
        if (moviesWithBothRatings.length >= 3) {
            const avgYours = moviesWithBothRatings.reduce((s, m) => s + (m.rating || 0), 0) / moviesWithBothRatings.length;
            const avgTmdb = moviesWithBothRatings.reduce((s, m) => s + (m.tmdb_rating || 0), 0) / moviesWithBothRatings.length;
            ratingTendency = {
                avg_yours: avgYours,
                avg_tmdb: avgTmdb,
                delta: avgYours - avgTmdb,
            };
        }

        // Biggest box office movie watched
        const biggestBoxOffice = [...yearMovies]
            .filter((m) => m.box_office && m.box_office > 0)
            .sort((a, b) => (b.box_office || 0) - (a.box_office || 0))[0] || null;

        // GC savings this year
        const yearGCIds = new Set<string>();
        yearMovies.forEach((m) => {
            (m.movie_gift_cards || []).forEach((mgc) => {
                yearGCIds.add(mgc.gift_card?.id || "");
            });
        });
        const gcSavings = giftCards
            .filter((gc) => yearGCIds.has(gc.id))
            .reduce((sum, gc) => sum + (gc.face_value - gc.amount_paid), 0);

        // Passport savings
        const passportSavings = yearMovies.reduce(
            (sum, m) => sum + (m.passport_savings || 0),
            0
        );

        // F&B totals
        const totalFnb = yearMovies.reduce(
            (sum, m) => sum + (m.fnb_cost || 0),
            0
        );

        // Day of week
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const dayCounts = new Array(7).fill(0);
        yearMovies.forEach((m) => {
            dayCounts[new Date(m.date).getDay()]++;
        });
        const favDayIdx = dayCounts.indexOf(Math.max(...dayCounts));

        return {
            year: selectedYear,
            totalMovies,
            totalSpent,
            avgRating,
            totalRuntime,
            topRated,
            mostExpensive,
            topFormat,
            topTheater,
            busiestMonth: monthNames[busiestMonth],
            busiestMonthCount: monthlyCount[busiestMonth],
            monthlyCount,
            topMood,
            topGenres,
            topDirectors,
            favoriteDirector,
            topLanguages,
            ratingTendency,
            biggestBoxOffice,
            gcSavings,
            passportSavings,
            totalFnb,
            favoriteDay: dayNames[favDayIdx],
            favoriteDayCount: dayCounts[favDayIdx],
        };
    }, [movies, giftCards, selectedYear]);

    const isLoading = moviesLoading || giftCardsLoading;

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

    const runtimeHours = Math.floor(stats.totalRuntime / 60);
    const runtimeMins = stats.totalRuntime % 60;

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
                {availableYears.length > 1 && (
                    <div className="flex gap-1.5">
                        {availableYears.map((y) => (
                            <button
                                key={y}
                                onClick={() => setSelectedYear(y)}
                                className={cn(
                                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                                    selectedYear === y
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-secondary/50 text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {y}
                            </button>
                        ))}
                    </div>
                )}
                {/* Hero Stats */}
                <div className="rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-6 text-center">
                    <Sparkles className="mx-auto h-8 w-8 text-primary" />
                    <p className="mt-2 text-sm text-muted-foreground">This year you watched</p>
                    <p className="mt-1 text-6xl font-bold text-primary">{stats.totalMovies}</p>
                    <p className="text-lg font-medium">movies</p>
                    {stats.totalRuntime > 0 && (
                        <p className="mt-1 text-sm text-muted-foreground">
                            {runtimeHours}h {runtimeMins}m in theaters
                        </p>
                    )}
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
                                    <div className="flex h-24 w-16 items-center justify-center rounded-lg bg-secondary">
                                        <Film className="h-6 w-6 text-muted-foreground" />
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
                                    {stats.topRated.director && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Dir. {stats.topRated.director}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Most Expensive Outing */}
                {stats.mostExpensive && stats.mostExpensive.total_cost > 0 && (
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <DollarSign className="h-4 w-4 text-orange-400" />
                                Most Expensive Outing
                            </div>
                            <div className="mt-2">
                                <p className="font-semibold">{stats.mostExpensive.title}</p>
                                <p className="text-lg font-bold text-orange-400">
                                    {formatCurrency(stats.mostExpensive.total_cost)}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Genre Breakdown */}
                {stats.topGenres.length > 0 && (
                    <Card>
                        <CardContent className="p-4">
                            <p className="text-sm font-medium text-muted-foreground">Top Genres</p>
                            <div className="mt-3 space-y-2">
                                {stats.topGenres.map(([genre, count], i) => (
                                    <div key={genre} className="flex items-center gap-3">
                                        <span className="w-5 text-center text-xs font-bold text-muted-foreground">
                                            {i + 1}
                                        </span>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-medium">{genre}</span>
                                                <span className="text-xs text-muted-foreground">{count}</span>
                                            </div>
                                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary/50">
                                                <div
                                                    className="h-full rounded-full bg-primary/60"
                                                    style={{ width: `${(count / stats.topGenres[0][1]) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Favorite Director */}
                {stats.favoriteDirector && stats.favoriteDirector[1] >= 2 && (
                    <StatCard
                        icon={Clapperboard}
                        label="Favorite Director"
                        value={stats.favoriteDirector[0]}
                        subValue={`${stats.favoriteDirector[1]} movies`}
                        accent
                    />
                )}

                {/* Language Breakdown */}
                {stats.topLanguages.length > 1 && (
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Globe className="h-4 w-4" />
                                Languages Watched
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {stats.topLanguages.map(([lang, count]) => (
                                    <Badge key={lang} variant="secondary">
                                        {lang} ({count})
                                    </Badge>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Rating Tendency */}
                {stats.ratingTendency && (
                    <Card>
                        <CardContent className="p-4">
                            <p className="text-sm font-medium text-muted-foreground">Your Rating vs TMDB</p>
                            <div className="mt-3 grid grid-cols-3 gap-4 text-center">
                                <div>
                                    <p className="text-xs text-muted-foreground">You</p>
                                    <p className="text-xl font-bold">{stats.ratingTendency.avg_yours.toFixed(1)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">TMDB</p>
                                    <p className="text-xl font-bold">{stats.ratingTendency.avg_tmdb.toFixed(1)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Tendency</p>
                                    <p className={cn(
                                        "text-xl font-bold",
                                        stats.ratingTendency.delta > 0 ? "text-emerald-400" : "text-orange-400"
                                    )}>
                                        {stats.ratingTendency.delta > 0 ? "+" : ""}
                                        {stats.ratingTendency.delta.toFixed(1)}
                                    </p>
                                </div>
                            </div>
                            <p className="mt-2 text-center text-xs text-muted-foreground">
                                {stats.ratingTendency.delta > 0.3
                                    ? "You tend to rate higher than TMDB average"
                                    : stats.ratingTendency.delta < -0.3
                                        ? "You tend to rate lower than TMDB average"
                                        : "You rate pretty close to TMDB average"}
                            </p>
                        </CardContent>
                    </Card>
                )}

                {/* Biggest Box Office */}
                {stats.biggestBoxOffice && (
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <TrendingUp className="h-4 w-4 text-emerald-400" />
                                Biggest Box Office Movie Watched
                            </div>
                            <div className="mt-2 flex items-center gap-3">
                                {stats.biggestBoxOffice.poster_url && (
                                    <img
                                        src={stats.biggestBoxOffice.poster_url}
                                        alt={stats.biggestBoxOffice.title}
                                        className="h-16 w-11 rounded object-cover"
                                    />
                                )}
                                <div>
                                    <p className="font-semibold">{stats.biggestBoxOffice.title}</p>
                                    <p className="text-sm text-emerald-400 font-medium">
                                        ${((stats.biggestBoxOffice.box_office || 0) / 1_000_000).toFixed(0)}M worldwide
                                    </p>
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
                        subValue={`${stats.busiestMonthCount} movies`}
                    />

                    <StatCard
                        icon={Calendar}
                        label="Favorite Day"
                        value={stats.favoriteDay}
                        subValue={`${stats.favoriteDayCount} movies`}
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

                {/* Savings & Spending */}
                <div className="space-y-3">
                    <h2 className="text-sm font-medium text-muted-foreground">Money</h2>

                    <div className="grid grid-cols-2 gap-3">
                        {stats.gcSavings > 0 && (
                            <Card>
                                <CardContent className="p-4">
                                    <CreditCard className="h-5 w-5 text-emerald-400" />
                                    <p className="mt-2 text-xl font-bold text-emerald-400">
                                        {formatCurrency(stats.gcSavings)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">GC Savings</p>
                                </CardContent>
                            </Card>
                        )}
                        {stats.passportSavings > 0 && (
                            <Card>
                                <CardContent className="p-4">
                                    <Shield className="h-5 w-5 text-blue-400" />
                                    <p className="mt-2 text-xl font-bold text-blue-400">
                                        {formatCurrency(stats.passportSavings)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">Passport Savings</p>
                                </CardContent>
                            </Card>
                        )}
                        {stats.totalFnb > 0 && (
                            <Card>
                                <CardContent className="p-4">
                                    <DollarSign className="h-5 w-5 text-orange-400" />
                                    <p className="mt-2 text-xl font-bold text-orange-400">
                                        {formatCurrency(stats.totalFnb)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">F&B Spending</p>
                                </CardContent>
                            </Card>
                        )}
                        {stats.totalRuntime > 0 && (
                            <Card>
                                <CardContent className="p-4">
                                    <Clock className="h-5 w-5 text-purple-400" />
                                    <p className="mt-2 text-xl font-bold text-purple-400">
                                        {runtimeHours}h {runtimeMins}m
                                    </p>
                                    <p className="text-xs text-muted-foreground">Total Runtime</p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>

                {/* Monthly Chart */}
                <Card>
                    <CardContent className="p-4">
                        <p className="text-sm font-medium text-muted-foreground">Monthly Activity</p>
                        <div className="mt-4 flex h-20 items-end gap-1">
                            {stats.monthlyCount.map((count: number, i: number) => (
                                <div
                                    key={i}
                                    className={cn(
                                        "flex-1 rounded-t transition-all",
                                        count > 0 ? "bg-primary/30 hover:bg-primary/50" : "bg-secondary/30"
                                    )}
                                    style={{
                                        height: count > 0
                                            ? `${Math.max(10, (count / Math.max(...stats.monthlyCount)) * 100)}%`
                                            : "4%",
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
