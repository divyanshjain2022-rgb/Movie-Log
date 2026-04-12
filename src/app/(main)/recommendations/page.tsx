"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Clock,
  ExternalLink,
  Globe,
  MapPin,
  RefreshCw,
  Sparkles,
  Ticket,
  ThumbsDown,
  X,
  Film,
  User,
  Users,
  MessageSquare,
  Star,
  Eye,
} from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PVR_CITIES, todayInIndia } from "@/lib/pvr/cities";
import { formatCurrency, formatDate, formatTime } from "@/lib/formula";
import type {
  MovieRecommendation,
  PredictionConfidenceLabel,
  PvrMovie,
  PvrRecommendationsResponse,
  RecommendationOption,
} from "@/lib/pvr/types";

const LANGUAGE_OPTIONS = ["ALL", "Hindi", "English", "Tamil", "Telugu", "Malayalam", "Kannada"];
const FORMAT_OPTIONS = ["ALL", "Regular", "IMAX", "4DX", "PXL", "LUXE", "INSIGNIA", "ATMOS"];
const TIME_OPTIONS = [
  { value: "08:00-24:00", label: "All day" },
  { value: "08:00-12:00", label: "Morning" },
  { value: "12:00-17:00", label: "Afternoon" },
  { value: "17:00-22:00", label: "Evening" },
  { value: "22:00-24:00", label: "Late" },
];

function formatPrice(option: RecommendationOption): string {
  if (option.displayPrice) return formatCurrency(option.displayPrice);

  const { min, max } = option.show.priceRange;
  if (min && max && min !== max) return `${formatCurrency(min)}-${formatCurrency(max)}`;
  if (min) return formatCurrency(min);
  return "Price pending";
}

function optionMeta(option: RecommendationOption): string {
  const parts = [
    option.show.screenName,
    option.show.language,
    option.exactPrice ? "exact price" : "fast price",
  ].filter(Boolean);
  return parts.join(" · ");
}

function confidenceBadgeClass(label: PredictionConfidenceLabel): string {
  if (label === "high") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (label === "medium") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }
  return "border-white/10 bg-white/5 text-muted-foreground";
}

function crowdDeltaLabel(delta: number | null): string | null {
  if (delta === null) return null;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)} vs TMDB`;
}

function RecommendationOptionRow({ option }: { option: RecommendationOption }) {
  const crowdDelta = crowdDeltaLabel(option.crowdDelta);

  return (
    <div className="rounded-lg border border-white/[0.06] bg-background/35 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold tabular-nums">
              {formatTime(option.show.showTime)}
            </span>
            <Badge variant="secondary" className="rounded-md">
              {option.show.format}
            </Badge>
            {option.show.language && (
              <Badge variant="outline" className="rounded-md">
                {option.show.language}
              </Badge>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span className="line-clamp-1">{option.show.cinemaName}</span>
          </div>
          {optionMeta(option) && (
            <p className="mt-1 text-xs text-muted-foreground/60">{optionMeta(option)}</p>
          )}
        </div>

        <div className="space-y-1 text-right">
          <div className="rounded-lg bg-primary/12 px-2 py-1">
            <p className="text-sm font-bold text-primary">
              {option.predictedPersonalRating.toFixed(1)}
            </p>
            <p className="text-[10px] text-primary/70">predicted</p>
          </div>
          <p className="text-sm font-bold tabular-nums">{formatPrice(option)}</p>
          <p className="text-[11px] text-muted-foreground/60">
            Value {option.valueScore.toFixed(1)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div className="flex gap-1.5">
          <Ticket className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{option.priceAdvice.bestValueClass || option.priceAdvice.targetPrice}</span>
        </div>
        <div className="flex gap-1.5">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{option.timingAdvice}</span>
        </div>
        <div>{option.formatAdvice}</div>
        <div>{option.availabilityLabel}</div>
        {option.priceAdvice.upgradeAdvice && (
          <div className="sm:col-span-2">{option.priceAdvice.upgradeAdvice}</div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={`rounded-md text-[11px] ${confidenceBadgeClass(option.predictionConfidenceLabel)}`}
          >
            {option.predictionConfidenceLabel} confidence
          </Badge>
          {crowdDelta && (
            <Badge variant="outline" className="rounded-md text-[11px]">
              {crowdDelta}
            </Badge>
          )}
        </div>
        <Button asChild size="sm" variant="outline">
          <a href={option.show.redirectUrl} target="_blank" rel="noreferrer">
            Open on PVR
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      </div>
    </div>
  );
}

function OtherPlayingCard({ movie }: { movie: PvrMovie }) {
  return (
    <a
      href={movie.redirectUrl}
      target="_blank"
      rel="noreferrer"
      className="group flex gap-3 rounded-lg bg-card/40 p-2.5 transition hover:bg-card/60"
    >
      {movie.posterUrl ? (
        <img
          src={movie.posterUrl}
          alt={movie.title}
          className="h-20 w-14 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-md bg-secondary/40">
          <Sparkles className="h-4 w-4 text-muted-foreground/40" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight group-hover:text-primary">
          {movie.title}
        </h3>
        <div className="mt-1 flex flex-wrap gap-1">
          {movie.languages.slice(0, 2).map((lang) => (
            <Badge key={lang} variant="outline" className="rounded-md text-[10px]">
              {lang}
            </Badge>
          ))}
          {movie.genres.slice(0, 2).map((genre) => (
            <Badge key={genre} variant="secondary" className="rounded-md text-[10px]">
              {genre}
            </Badge>
          ))}
        </div>
      </div>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 group-hover:text-primary" />
    </a>
  );
}

function RecommendationCard({
  recommendation,
  onDismiss,
}: {
  recommendation: MovieRecommendation;
  onDismiss: (movieId: string, movieTitle: string) => void;
}) {
  const crowdDelta = crowdDeltaLabel(recommendation.crowdDelta);

  return (
    <section className="rounded-xl bg-card/40 p-3.5">
      <div className="flex gap-3">
        {recommendation.movie.posterUrl ? (
          <img
            src={recommendation.movie.posterUrl}
            alt={recommendation.movie.title}
            className="h-24 w-16 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded-lg bg-secondary/40">
            <Sparkles className="h-5 w-5 text-muted-foreground/40" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="line-clamp-2 text-base font-semibold leading-tight">
                {recommendation.movie.title}
              </h2>
              {recommendation.movie.releaseDate && (
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDate(recommendation.movie.releaseDate)}
                </p>
              )}
            </div>
            <div className="flex items-start gap-1.5">
              <button
                onClick={() => onDismiss(recommendation.movie.id, recommendation.movie.title)}
                className="rounded-md p-1.5 text-muted-foreground/50 transition hover:bg-destructive/10 hover:text-destructive"
                title="Not interested"
              >
                <ThumbsDown className="h-4 w-4" />
              </button>
              <div className="rounded-lg bg-primary/12 px-2 py-1 text-right">
                <p className="text-sm font-bold text-primary">
                  {recommendation.predictedRating.toFixed(1)}
                </p>
                <p className="text-[10px] text-primary/70">predicted</p>
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge
              variant="outline"
              className={`rounded-md text-[11px] ${confidenceBadgeClass(recommendation.predictionConfidenceLabel)}`}
            >
              {recommendation.predictionConfidenceLabel} confidence
            </Badge>
            {crowdDelta && (
              <Badge variant="outline" className="rounded-md text-[11px]">
                {crowdDelta}
              </Badge>
            )}
            {recommendation.reasons.map((reason) => (
              <Badge key={reason} variant="outline" className="rounded-md text-[11px]">
                {reason}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {recommendation.options.map((option) => (
          <RecommendationOptionRow key={option.show.showKey} option={option} />
        ))}
      </div>
    </section>
  );
}

interface DismissalReasonOption {
  reason: string;
  reasonDetail: string | null;
  label: string;
  icon: React.ReactNode;
}

function DismissalModal({
  movie,
  onDismiss,
  onClose,
}: {
  movie: MovieRecommendation | null;
  onDismiss: (movieId: string, reasons: Array<{ reason: string; reasonDetail?: string | null }>) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  if (!movie) return null;

  const options: DismissalReasonOption[] = [];

  // Language options — each language is its own independent button
  for (const lang of movie.movie.languages) {
    options.push({
      reason: "language",
      reasonDetail: lang,
      label: `Not interested in ${lang} movies`,
      icon: <Globe className="h-4 w-4" />,
    });
  }

  // Genre options
  for (const genre of movie.movie.genres.slice(0, 4)) {
    options.push({
      reason: "genre",
      reasonDetail: genre,
      label: `Not interested in ${genre}`,
      icon: <Film className="h-4 w-4" />,
    });
  }

  // Director
  if (movie.movie.director) {
    options.push({
      reason: "director",
      reasonDetail: movie.movie.director,
      label: `Not interested in ${movie.movie.director}'s films`,
      icon: <User className="h-4 w-4" />,
    });
  }

  // Cast
  for (const actor of (movie.movie.cast || []).slice(0, 3)) {
    options.push({
      reason: "cast",
      reasonDetail: actor,
      label: `Not interested in ${actor}`,
      icon: <Users className="h-4 w-4" />,
    });
  }

  // Story / generic
  options.push({
    reason: "story",
    reasonDetail: null,
    label: "Not my type of story",
    icon: <MessageSquare className="h-4 w-4" />,
  });

  // Bad reviews
  options.push({
    reason: "bad_reviews",
    reasonDetail: null,
    label: "Bad reviews / low quality",
    icon: <Star className="h-4 w-4" />,
  });

  // Already seen
  options.push({
    reason: "seen_it",
    reasonDetail: null,
    label: "Already seen it",
    icon: <Eye className="h-4 w-4" />,
  });

  const toggleOption = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const optionKey = (opt: DismissalReasonOption) => `${opt.reason}:${opt.reasonDetail || ""}`;

  const handleSubmit = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    const reasons = options
      .filter((opt) => selected.has(optionKey(opt)))
      .map((opt) => ({ reason: opt.reason, reasonDetail: opt.reasonDetail }));
    onDismiss(movie.movie.id, reasons);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-t-2xl bg-card p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold">Not interested</h3>
            <p className="mt-0.5 text-sm text-muted-foreground line-clamp-1">
              {movie.movie.title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 text-xs text-muted-foreground">
          Select why you&apos;re not interested. This trains the engine to show better recommendations.
        </p>

        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {options.map((opt) => {
            const key = optionKey(opt);
            const isSelected = selected.has(key);
            return (
              <button
                key={key}
                onClick={() => toggleOption(key)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  isSelected
                    ? "bg-destructive/15 text-destructive border border-destructive/30"
                    : "bg-secondary/30 text-foreground hover:bg-secondary/50 border border-transparent"
                }`}
              >
                {opt.icon}
                <span className="flex-1">{opt.label}</span>
                {isSelected && (
                  <span className="text-xs font-medium">✓</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            disabled={selected.size === 0 || submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Saving..." : `Dismiss${selected.size > 0 ? ` (${selected.size})` : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function RecommendationsPage() {
  const [city, setCity] = useState("Lucknow");
  const [date, setDate] = useState(todayInIndia());
  const [language, setLanguage] = useState("ALL");
  const [format, setFormat] = useState("ALL");
  const [time, setTime] = useState("08:00-24:00");
  const [data, setData] = useState<PvrRecommendationsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [dismissTarget, setDismissTarget] = useState<MovieRecommendation | null>(null);

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams({
      city,
      date,
      language,
      format,
      time,
    });
    return `/api/pvr/recommendations?${params.toString()}`;
  }, [city, date, language, format, time]);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchRecommendations() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch(requestUrl, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load recommendations");
        }
        setData(payload as PvrRecommendationsResponse);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load recommendations");
        setData(null);
      } finally {
        setIsLoading(false);
      }
    }

    fetchRecommendations();
    return () => controller.abort();
  }, [requestUrl, refreshKey]);

  const handleOpenDismiss = useCallback((movieId: string, _movieTitle: string) => {
    const rec = data?.recommendations.find((r) => r.movie.id === movieId);
    if (rec) setDismissTarget(rec);
  }, [data]);

  const handleDismiss = useCallback(async (
    movieId: string,
    reasons: Array<{ reason: string; reasonDetail?: string | null }>
  ) => {
    const rec = data?.recommendations.find((r) => r.movie.id === movieId);
    if (!rec) return;

    // Immediately hide from UI
    setDismissedIds((prev) => new Set(prev).add(movieId));
    setDismissTarget(null);

    // Persist to API
    try {
      await fetch("/api/pvr/dismissals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movieTitle: rec.movie.title,
          pvrMovieId: movieId,
          reasons,
        }),
      });
    } catch {
      // Silently fail — movie is already hidden in UI
    }
  }, [data]);

  const visibleRecommendations = useMemo(
    () => (data?.recommendations || []).filter((r) => !dismissedIds.has(r.movie.id)),
    [data, dismissedIds]
  );

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Recommendations"
        showBack
        action={
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={isLoading}
          >
            <RefreshCw className={isLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        }
      />

      <div className="space-y-4 p-4">
        <section className="grid gap-2 sm:grid-cols-2">
          <Select value={city} onValueChange={setCity}>
            <SelectTrigger className="w-full rounded-lg bg-card/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PVR_CITIES.map((item) => (
                <SelectItem key={item.name} value={item.name}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="h-9 rounded-lg border border-input bg-card/40 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />

          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-full rounded-lg bg-card/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((item) => (
                <SelectItem key={item} value={item}>
                  {item === "ALL" ? "All languages" : item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={format} onValueChange={setFormat}>
            <SelectTrigger className="w-full rounded-lg bg-card/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMAT_OPTIONS.map((item) => (
                <SelectItem key={item} value={item}>
                  {item === "ALL" ? "All formats" : item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={time} onValueChange={setTime}>
            <SelectTrigger className="w-full rounded-lg bg-card/40 sm:col-span-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        {data && (
          <section className="rounded-xl bg-card/35 p-3 text-xs text-muted-foreground">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-base font-bold text-foreground">
                  {data.recommendations.length}
                </p>
                <p>movies</p>
              </div>
              <div>
                <p className="text-base font-bold text-foreground">
                  {data.diagnostics.showCount}
                </p>
                <p>shows</p>
              </div>
              <div>
                <p className="text-base font-bold text-foreground">
                  {data.diagnostics.exactSeatQuoteCount}
                </p>
                <p>exact checks</p>
              </div>
            </div>
            {data.diagnostics.stale && (
              <p className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1 text-amber-400">
                Showing cached PVR data because the live endpoint did not refresh.
              </p>
            )}
            {data.diagnostics.localMode && (
              <p className="mt-2 rounded-lg bg-primary/10 px-2 py-1 text-primary">
                Supabase keys are not configured, so recommendations use a local demo Movie Log profile.
              </p>
            )}
            {data.diagnostics.errors.length > 0 && (
              <p className="mt-2 text-muted-foreground/70">
                Some PVR checks failed, so the list uses the available results.
              </p>
            )}
          </section>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-44 rounded-xl" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
            <p className="text-sm font-medium text-destructive">{error}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Check the PVR endpoint availability, then refresh.
            </p>
          </div>
        ) : data && visibleRecommendations.length > 0 ? (
          <div className="space-y-4">
            {visibleRecommendations.map((recommendation) => (
              <RecommendationCard
                key={recommendation.movie.id}
                recommendation={recommendation}
                onDismiss={handleOpenDismiss}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <Sparkles className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No live PVR sessions found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try another city, date, language, or format.
            </p>
          </div>
        )}

        {data && data.otherPlaying && data.otherPlaying.length > 0 && (
          <details className="group rounded-xl bg-card/35 p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Also playing</h2>
                <p className="text-xs text-muted-foreground">
                  {data.otherPlaying.length} more movies in {data.city} you haven&apos;t watched
                </p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {data.otherPlaying.map((movie) => (
                <OtherPlayingCard key={movie.id} movie={movie} />
              ))}
            </div>
          </details>
        )}
      </div>

      {dismissTarget && (
        <DismissalModal
          movie={dismissTarget}
          onDismiss={handleDismiss}
          onClose={() => setDismissTarget(null)}
        />
      )}
    </div>
  );
}
