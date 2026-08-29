"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared";
import { useMovies } from "@/hooks";
import { getRatingColor } from "@/lib/formula";
import { cn } from "@/lib/utils";
import { tmdbImage } from "@/lib/tmdb-image";

export default function CalendarPage() {
  const { movies, isLoading } = useMovies();
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthName = currentDate.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  // Get first day and total days of month
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Group movies by date string (YYYY-MM-DD)
  const moviesByDate = useMemo(() => {
    const map: Record<string, typeof movies> = {};
    movies.forEach((m) => {
      const d = m.date;
      if (!map[d]) map[d] = [];
      map[d].push(m);
    });
    return map;
  }, [movies]);

  // Selected day
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const selectedDateStr = selectedDay
    ? `${year}-${String(month + 1).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`
    : null;

  const selectedMovies = selectedDateStr ? moviesByDate[selectedDateStr] || [] : [];

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDay(null);
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDay(null);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDay(new Date().getDate());
  };

  return (
    <div className="min-h-screen">
      <PageHeader title="Calendar" showBack />

      <div className="p-4">
        {isLoading ? (
          <Skeleton className="h-[400px] rounded-xl" />
        ) : (
          <>
            {/* Month Navigation */}
            <div className="mb-4 flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={goToPrevMonth}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <button
                className="text-lg font-semibold hover:text-primary transition-colors"
                onClick={goToToday}
              >
                {monthName}
              </button>
              <Button variant="ghost" size="icon" onClick={goToNextMonth}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            {/* Day of Week Headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div
                  key={d}
                  className="py-1 text-center text-xs font-medium text-muted-foreground"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells for days before the first */}
              {Array.from({ length: firstDayOfMonth }, (_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}

              {/* Day cells */}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayMovies = moviesByDate[dateStr] || [];
                const hasMovies = dayMovies.length > 0;
                const isSelected = selectedDay === day;
                const isToday =
                  day === new Date().getDate() &&
                  month === new Date().getMonth() &&
                  year === new Date().getFullYear();

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    className={cn(
                      "relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-all",
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : isToday
                        ? "bg-primary/10 font-semibold"
                        : "hover:bg-secondary/50",
                      hasMovies && !isSelected && "font-medium"
                    )}
                  >
                    <span>{day}</span>
                    {hasMovies && (
                      <div className="absolute bottom-1 flex gap-0.5">
                        {dayMovies.slice(0, 3).map((_, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              "h-1 w-1 rounded-full",
                              isSelected ? "bg-primary-foreground" : "bg-primary"
                            )}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected Day Movie List */}
            {selectedDay && (
              <div className="mt-6">
                <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                  {new Date(year, month, selectedDay).toLocaleDateString("en-IN", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </h3>
                {selectedMovies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No movies on this day</p>
                ) : (
                  <div className="space-y-2">
                    {selectedMovies.map((movie) => (
                      <Link
                        key={movie.id}
                        href={`/movies/${movie.id}`}
                        className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-secondary/50"
                      >
                        {movie.poster_url ? (
                          <img loading="lazy" decoding="async"
                            src={tmdbImage(movie.poster_url, "w154")}
                            alt={movie.title}
                            className="h-14 w-10 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-14 w-10 items-center justify-center rounded bg-secondary text-lg">
                            🎬
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{movie.title}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {movie.theater?.name && <span>{movie.theater.name}</span>}
                            {movie.format?.name && (
                              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                {movie.format.name}
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
                )}
              </div>
            )}

            {/* Monthly Stats */}
            {!selectedDay && (
              <div className="mt-6">
                {(() => {
                  const monthMovies = movies.filter((m) => {
                    const d = new Date(m.date);
                    return d.getFullYear() === year && d.getMonth() === month;
                  });
                  if (monthMovies.length === 0) return null;
                  return (
                    <div className="rounded-lg bg-secondary/30 p-3 text-center">
                      <p className="text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {monthMovies.length}
                        </span>{" "}
                        {monthMovies.length === 1 ? "movie" : "movies"} this month
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
