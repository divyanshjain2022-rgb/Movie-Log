"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Armchair,
  Bookmark,
  BookmarkCheck,
  BookmarkPlus,
  CalendarDays,
  ChevronDown,
  Clock,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
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
import { toast } from "sonner";
import { SeatMap } from "@/components/movies/seat-map";
import { useCreateWatchlistItem } from "@/hooks/use-watchlist";
import { useFormulaParams } from "@/hooks/use-formula-params";
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
import { formatCurrency, formatDate, formatTime, getValueTier } from "@/lib/formula";
import type {
  MovieRecommendation,
  PredictionConfidenceLabel,
  PvrMovie,
  PvrRecommendationsResponse,
  PvrSeatQuote,
  PvrShow,
  RecommendationOption,
} from "@/lib/pvr/types";
import { tmdbImage } from "@/lib/tmdb-image";

const LANGUAGE_OPTIONS = ["ALL", "Hindi", "English", "Tamil", "Telugu", "Malayalam", "Kannada"];
const FORMAT_OPTIONS = ["ALL", "Regular", "IMAX", "4DX", "PXL", "LUXE", "INSIGNIA", "ATMOS"];
const TIME_OPTIONS = [
  { value: "08:00-24:00", label: "All day" },
  { value: "08:00-12:00", label: "Morning" },
  { value: "12:00-17:00", label: "Afternoon" },
  { value: "17:00-22:00", label: "Evening" },
  { value: "22:00-24:00", label: "Late" },
];

// How many taste-ranked picks sit in "For you" before the rest fall into "Also playing".
const FOR_YOU_LIMIT = 6;

const DEFAULT_TIME = "08:00-24:00";
// PVR only sells tickets about a week out.
const MAX_BOOKING_DAYS_AHEAD = 7;
const FILTER_STORAGE_KEY = "pvr-recs-filters";

interface PersistedDismissal {
  id: string;
  movie_title: string;
  pvr_movie_id: string;
  reason: string;
  reason_detail: string | null;
}

const DISMISS_REASON_LABELS: Record<string, string> = {
  language: "language",
  genre: "genre",
  director: "director",
  cast: "cast",
  story: "story",
  seen_it: "seen it",
  bad_reviews: "bad reviews",
};

function dismissalReasonSummary(rows: PersistedDismissal[]): string {
  const parts = rows.map((row) => {
    const label = DISMISS_REASON_LABELS[row.reason] || row.reason;
    return row.reason_detail ? `${label}: ${row.reason_detail}` : label;
  });
  return Array.from(new Set(parts)).join(" · ");
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

// Today / Tomorrow / next Saturday, relative to "today in India".
function dateChips(today: string): Array<{ label: string; value: string }> {
  const day = new Date(`${today}T00:00:00`).getDay(); // 0 Sun .. 6 Sat
  const daysUntilSaturday = (6 - day + 7) % 7;
  return [
    { label: "Today", value: today },
    { label: "Tomorrow", value: addDays(today, 1) },
    { label: "Weekend", value: addDays(today, daysUntilSaturday) },
  ];
}

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
  return `${sign}${delta.toFixed(1)} vs crowd`;
}

function cheapestOptionPrice(recommendation: MovieRecommendation): number | null {
  const prices = recommendation.options
    .map((option) => option.displayPrice || option.show.priceRange.min)
    .filter((value): value is number => typeof value === "number" && value > 0);
  if (prices.length === 0) return null;
  return Math.min(...prices);
}

function showtimeSummary(recommendation: MovieRecommendation): string {
  const count = recommendation.options.length;
  const showWord = count === 1 ? "show" : "shows";
  const price = cheapestOptionPrice(recommendation);
  if (price) return `${count} ${showWord} · from ${formatCurrency(price)}`;
  return `${count} ${showWord}`;
}

function RecommendationOptionRow({
  option,
  onViewSeats,
}: {
  option: RecommendationOption;
  onViewSeats?: (show: PvrShow) => void;
}) {
  const crowdDelta = crowdDeltaLabel(option.crowdDelta);
  const formulaParams = useFormulaParams();

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
          <div className="rounded-lg bg-gradient-to-b from-amber-400/20 to-amber-600/10 px-2 py-1 ring-1 ring-primary/20">
            <p className="marquee text-lg leading-none text-primary">
              {option.predictedPersonalRating.toFixed(1)}
            </p>
            <p className="text-[9px] uppercase tracking-[0.12em] text-primary/70">predicted</p>
          </div>
          <p className="text-sm font-bold tabular-nums">{formatPrice(option)}</p>
          <p className="text-[11px] text-muted-foreground/60">
            Value {option.valueScore.toFixed(1)}
            {option.valueScore > 0 && (
              <span className={`ml-1 ${getValueTier(option.valueScore, formulaParams).className}`}>
                {getValueTier(option.valueScore, formulaParams).label}
              </span>
            )}
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
        <div>
          {option.availabilityLabel}
          {option.occupancyPercent !== null && (
            <span className="ml-1 text-foreground/80">
              · hall {option.occupancyPercent}% full
            </span>
          )}
        </div>
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
        <div className="flex items-center gap-2">
          {onViewSeats && option.show.encrypted && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onViewSeats(option.show)}
            >
              <Armchair className="h-3.5 w-3.5" />
              Seats
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <a href={option.show.redirectUrl} target="_blank" rel="noreferrer">
              Open on PVR
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

function OtherPlayingCard({
  movie,
  pulling,
  error,
  onPull,
  onAddToWatchlist,
  watchlistState = "none",
}: {
  movie: PvrMovie;
  pulling: boolean;
  error: string | null;
  onPull: (movie: PvrMovie) => void;
  onAddToWatchlist: (movie: PvrMovie) => void;
  watchlistState?: "none" | "adding" | "added";
}) {
  return (
    <div className="flex gap-3 rounded-lg bg-card/40 p-2.5">
      {movie.posterUrl ? (
        <img
          src={tmdbImage(movie.posterUrl, "w185")}
          alt={movie.title}
          loading="lazy"
          className="h-20 w-14 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-md bg-secondary/40">
          <Sparkles className="h-4 w-4 text-muted-foreground/40" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold leading-tight">{movie.title}</h3>
          <a
            href={movie.redirectUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-muted-foreground/60 transition hover:text-primary"
            title="Open on PVR"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {movie.watched && (
            <Badge className="rounded-md bg-primary/15 text-[10px] text-primary hover:bg-primary/15">
              Watched
            </Badge>
          )}
          {movie.eventCategory && (
            <Badge className="rounded-md bg-amber-500/15 text-[10px] text-amber-400 hover:bg-amber-500/15">
              {movie.eventCategory.charAt(0) + movie.eventCategory.slice(1).toLowerCase()} event
            </Badge>
          )}
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
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={pulling}
            onClick={() => onPull(movie)}
          >
            {pulling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {pulling ? "Loading" : "Get showtimes"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={watchlistState !== "none"}
            onClick={() => onAddToWatchlist(movie)}
            title="Add to watchlist"
          >
            {watchlistState === "adding" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : watchlistState === "added" ? (
              <BookmarkCheck className="h-3.5 w-3.5 text-primary" />
            ) : (
              <BookmarkPlus className="h-3.5 w-3.5" />
            )}
            {watchlistState === "added" ? "On watchlist" : "Watchlist"}
          </Button>
          {error && <span className="text-[11px] text-muted-foreground/70">{error}</span>}
        </div>
      </div>
    </div>
  );
}

function UpcomingWatchlistCard({ movie }: { movie: PvrMovie }) {
  return (
    <a
      href={movie.redirectUrl}
      target="_blank"
      rel="noreferrer"
      className="group flex gap-3 rounded-lg bg-card/40 p-2.5 transition hover:bg-card/60"
    >
      {movie.posterUrl ? (
        <img
          src={tmdbImage(movie.posterUrl, "w185")}
          alt={movie.title}
          loading="lazy"
          className="h-20 w-14 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-md bg-secondary/40">
          <Bookmark className="h-4 w-4 text-muted-foreground/40" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight group-hover:text-primary">
          {movie.title}
        </h3>
        {movie.releaseDate && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDate(movie.releaseDate)}
          </p>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground/70">No shows yet — coming soon</p>
      </div>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 group-hover:text-primary" />
    </a>
  );
}

function RecommendationCard({
  recommendation,
  expanded,
  onToggle,
  onDismiss,
  onReprice,
  repricing,
  onAddToWatchlist,
  watchlistState = "none",
  onViewSeats,
  showAll = false,
  onToggleShowAll,
}: {
  recommendation: MovieRecommendation;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: (movieId: string, movieTitle: string) => void;
  onReprice?: (recommendation: MovieRecommendation) => void;
  repricing?: boolean;
  onAddToWatchlist?: (movie: PvrMovie) => void;
  watchlistState?: "none" | "adding" | "added";
  onViewSeats?: (show: PvrShow) => void;
  showAll?: boolean;
  onToggleShowAll?: (movieId: string) => void;
}) {
  const crowdDelta = crowdDeltaLabel(recommendation.crowdDelta);
  const topReason = recommendation.reasons[0];
  const allOptions = recommendation.allOptions ?? recommendation.options;
  const hasMore = allOptions.length > recommendation.options.length;
  const displayedOptions = showAll ? allOptions : recommendation.options;
  const needsExactPrice = displayedOptions.some((option) => !option.exactPrice);
  const showWatchlistAdd = Boolean(onAddToWatchlist) && !recommendation.onWatchlist;

  return (
    <section className="overflow-hidden rounded-xl bg-card/40">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
        className="flex w-full cursor-pointer gap-3 p-3.5 text-left transition hover:bg-card/60"
      >
        {recommendation.movie.posterUrl ? (
          <img
            src={tmdbImage(recommendation.movie.posterUrl, "w342")}
            alt={recommendation.movie.title}
            loading="lazy"
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
              <h2 className="marquee line-clamp-2 text-[19px] uppercase leading-[1.05] text-foreground/95">
                {recommendation.movie.title}
              </h2>
              {recommendation.movie.releaseDate && (
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDate(recommendation.movie.releaseDate)}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-start gap-1.5">
              {showWatchlistAdd && (
                <button
                  type="button"
                  disabled={watchlistState !== "none"}
                  onClick={(event) => {
                    event.stopPropagation();
                    onAddToWatchlist?.(recommendation.movie);
                  }}
                  className="rounded-md p-1.5 text-muted-foreground/50 transition hover:bg-primary/10 hover:text-primary disabled:opacity-100"
                  title={watchlistState === "added" ? "On your watchlist" : "Add to watchlist"}
                >
                  {watchlistState === "adding" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : watchlistState === "added" ? (
                    <BookmarkCheck className="h-4 w-4 text-primary" />
                  ) : (
                    <BookmarkPlus className="h-4 w-4" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDismiss(recommendation.movie.id, recommendation.movie.title);
                }}
                className="rounded-md p-1.5 text-muted-foreground/50 transition hover:bg-destructive/10 hover:text-destructive"
                title="Not interested"
              >
                <ThumbsDown className="h-4 w-4" />
              </button>
              <div className="rounded-lg bg-gradient-to-b from-amber-400/20 to-amber-600/10 px-2 py-1 text-right ring-1 ring-primary/20">
                <p className="marquee text-lg leading-none text-primary">
                  {recommendation.predictedRating.toFixed(1)}
                </p>
                <p className="text-[9px] uppercase tracking-[0.12em] text-primary/70">predicted</p>
              </div>
              <ChevronDown
                className={`mt-1 h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            </div>
          </div>

          {topReason && (
            <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">{topReason}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className={`rounded-md text-[11px] ${confidenceBadgeClass(recommendation.predictionConfidenceLabel)}`}
            >
              {recommendation.predictionConfidenceLabel} confidence
            </Badge>
            {recommendation.onWatchlist && (
              <Badge
                variant="outline"
                className="rounded-md border-primary/30 bg-primary/10 text-[11px] text-primary"
              >
                <Bookmark className="mr-0.5 h-3 w-3" /> Watchlist
              </Badge>
            )}
            {crowdDelta && (
              <Badge variant="outline" className="rounded-md text-[11px]">
                {crowdDelta}
              </Badge>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground/70">
              {showtimeSummary(recommendation)}
            </span>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="space-y-2 px-3.5 pb-3.5">
          {recommendation.reasons.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {recommendation.reasons.slice(1).map((reason) => (
                <Badge key={reason} variant="outline" className="rounded-md text-[11px]">
                  {reason}
                </Badge>
              ))}
            </div>
          )}
          {needsExactPrice && onReprice && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-full text-xs"
              disabled={repricing}
              onClick={() => onReprice(recommendation)}
            >
              {repricing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Ticket className="h-3.5 w-3.5" />
              )}
              {repricing ? "Checking prices" : "Get exact prices"}
            </Button>
          )}
          {displayedOptions.map((option) => (
            <RecommendationOptionRow
              key={option.show.showKey}
              option={option}
              onViewSeats={onViewSeats}
            />
          ))}
          {hasMore && onToggleShowAll && (
            <button
              type="button"
              onClick={() => onToggleShowAll(recommendation.movie.id)}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-white/[0.06] bg-background/35 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              {showAll ? (
                <>Show fewer showtimes</>
              ) : (
                <>Show all {allOptions.length} showtimes</>
              )}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAll ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      )}
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
        className="glass-strong relative w-full max-w-md rounded-t-2xl p-5 sm:rounded-2xl"
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

function SeatLayoutModal({
  show,
  quote,
  loading,
  error,
  onClose,
}: {
  show: PvrShow;
  quote: PvrSeatQuote | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="glass-strong relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-1 text-base font-semibold">{show.movieTitle}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatTime(show.showTime)} · {show.format}
              {show.screenName ? ` · ${show.screenName}` : ""}
            </p>
            <p className="line-clamp-1 text-xs text-muted-foreground/70">{show.cinemaName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading seat map…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : quote ? (
          <SeatMap
            categories={quote.categories}
            rows={quote.rows}
            availableSeatCount={quote.availableSeatCount}
            recommendedCode={quote.recommendedCategory?.code}
          />
        ) : null}
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [dismissTarget, setDismissTarget] = useState<MovieRecommendation | null>(null);
  const [pulledById, setPulledById] = useState<Record<string, MovieRecommendation>>({});
  const [pullingId, setPullingId] = useState<string | null>(null);
  const [pullErrorById, setPullErrorById] = useState<Record<string, string>>({});
  const [repricedById, setRepricedById] = useState<Record<string, MovieRecommendation>>({});
  const [repricingId, setRepricingId] = useState<string | null>(null);
  const [addedWatchlistIds, setAddedWatchlistIds] = useState<Set<string>>(new Set());
  const [addingWatchlistId, setAddingWatchlistId] = useState<string | null>(null);
  const { createItem: createWatchlistItem } = useCreateWatchlistItem();
  const [seatShow, setSeatShow] = useState<PvrShow | null>(null);
  const [seatQuote, setSeatQuote] = useState<PvrSeatQuote | null>(null);
  const [seatLoading, setSeatLoading] = useState(false);
  const [seatError, setSeatError] = useState<string | null>(null);
  const [showAllById, setShowAllById] = useState<Record<string, boolean>>({});
  const [persistedDismissals, setPersistedDismissals] = useState<PersistedDismissal[]>([]);
  // Filters restore from localStorage after mount; hold the first fetch until then.
  const [filtersReady, setFiltersReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, unknown>;
        if (typeof saved.city === "string" && PVR_CITIES.some((item) => item.name === saved.city)) {
          setCity(saved.city);
        }
        if (typeof saved.language === "string" && LANGUAGE_OPTIONS.includes(saved.language)) {
          setLanguage(saved.language);
        }
        if (typeof saved.format === "string" && FORMAT_OPTIONS.includes(saved.format)) {
          setFormat(saved.format);
        }
        if (typeof saved.time === "string" && TIME_OPTIONS.some((item) => item.value === saved.time)) {
          setTime(saved.time);
        }
      }
    } catch {
      // Corrupted saved filters — defaults are fine.
    }
    setFiltersReady(true);
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    try {
      localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({ city, language, format, time })
      );
    } catch {
      // Storage unavailable (private mode) — filters just won't persist.
    }
  }, [filtersReady, city, language, format, time]);

  // Persisted "not interested" dismissals keep movies hidden across sessions.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/pvr/dismissals")
      .then((response) => (response.ok ? response.json() : { dismissals: [] }))
      .then((payload) => {
        if (cancelled) return;
        const rows = (payload.dismissals || []) as PersistedDismissal[];
        setPersistedDismissals(rows);
        setDismissedIds((prev) => {
          const next = new Set(prev);
          for (const row of rows) next.add(row.pvr_movie_id);
          return next;
        });
      })
      .catch(() => {
        // Not signed in / endpoint unavailable — session-only dismissals still work.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!filtersReady) return;
    const controller = new AbortController();

    async function fetchRecommendations() {
      try {
        setIsLoading(true);
        setError(null);
        // A new query invalidates any movies pulled in / repriced from the previous one.
        setPulledById({});
        setPullErrorById({});
        setRepricedById({});
        // Phase 1: ranked list without the live seat-layout pass — renders
        // immediately when the cron-warmed cache is hot.
        const response = await fetch(`${requestUrl}&quotes=skip`, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load recommendations");
        }
        setData(payload as PvrRecommendationsResponse);
        setIsLoading(false);
        // Phase 2: same query with live seat quotes; prices upgrade in place.
        // A failure here keeps the phase-1 result — quotes are an enhancement.
        try {
          const fullResponse = await fetch(requestUrl, { signal: controller.signal });
          if (fullResponse.ok) {
            setData((await fullResponse.json()) as PvrRecommendationsResponse);
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
        }
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
  }, [requestUrl, refreshKey, filtersReady]);

  // Open the top pick by default whenever a fresh result arrives.
  useEffect(() => {
    if (!data) {
      setExpandedId(null);
      return;
    }
    const firstWatchlist = data.recommendations.find((rec) => rec.onWatchlist);
    const firstForYou = data.recommendations.find((rec) => !rec.onWatchlist);
    setExpandedId((firstForYou || firstWatchlist)?.movie.id ?? null);
  }, [data]);

  const toggleCard = (id: string) =>
    setExpandedId((current) => (current === id ? null : id));

  const toggleShowAll = (id: string) =>
    setShowAllById((current) => ({ ...current, [id]: !current[id] }));

  const findRec = useCallback(
    (movieId: string) =>
      data?.recommendations.find((r) => r.movie.id === movieId) || pulledById[movieId] || null,
    [data, pulledById]
  );

  const handleOpenDismiss = useCallback((movieId: string, _movieTitle: string) => {
    const rec = findRec(movieId);
    if (rec) setDismissTarget(rec);
  }, [findRec]);

  const handleDismiss = useCallback(async (
    movieId: string,
    reasons: Array<{ reason: string; reasonDetail?: string | null }>
  ) => {
    const rec = findRec(movieId);
    if (!rec) return;

    // Immediately hide from UI (covers both ranked and pulled-in movies)
    setDismissedIds((prev) => new Set(prev).add(movieId));
    setPulledById((prev) => {
      if (!prev[movieId]) return prev;
      const next = { ...prev };
      delete next[movieId];
      return next;
    });
    setDismissTarget(null);

    // Persist to API
    try {
      const response = await fetch("/api/pvr/dismissals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movieTitle: rec.movie.title,
          pvrMovieId: movieId,
          reasons,
        }),
      });
      if (response.ok) {
        const payload = await response.json();
        const rows = (payload.dismissals || []) as PersistedDismissal[];
        if (rows.length > 0) {
          setPersistedDismissals((prev) => [...rows, ...prev]);
        }
      }
    } catch {
      // Silently fail — movie is already hidden in UI
    }
  }, [findRec]);

  const handleUndoDismiss = useCallback(async (pvrMovieId: string) => {
    setPersistedDismissals((prev) => prev.filter((row) => row.pvr_movie_id !== pvrMovieId));
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.delete(pvrMovieId);
      return next;
    });
    try {
      await fetch(`/api/pvr/dismissals?pvrMovieId=${encodeURIComponent(pvrMovieId)}`, {
        method: "DELETE",
      });
    } catch {
      // Already un-hidden locally; the server row will be retried on next dismiss/undo.
    }
  }, []);

  const handlePull = useCallback(async (movie: PvrMovie) => {
    setPullingId(movie.id);
    setPullErrorById((prev) => {
      const next = { ...prev };
      delete next[movie.id];
      return next;
    });
    try {
      const response = await fetch("/api/pvr/movie-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, date, language, format, time, movie }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load showtimes");
      }
      if (payload.recommendation) {
        setPulledById((prev) => ({ ...prev, [movie.id]: payload.recommendation as MovieRecommendation }));
        setExpandedId(movie.id);
      } else {
        setPullErrorById((prev) => ({
          ...prev,
          [movie.id]: "No showtimes for these filters",
        }));
      }
    } catch (err) {
      setPullErrorById((prev) => ({
        ...prev,
        [movie.id]: err instanceof Error ? err.message : "Failed to load showtimes",
      }));
    } finally {
      setPullingId(null);
    }
  }, [city, date, language, format, time]);

  // Re-fetch a single movie's sessions with exact seat prices (one PVR call set,
  // so it succeeds where the bulk fan-out got rate-limited and left prices pending).
  const handleReprice = useCallback(async (rec: MovieRecommendation) => {
    setRepricingId(rec.movie.id);
    try {
      const response = await fetch("/api/pvr/movie-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, date, language, format, time, movie: rec.movie }),
      });
      const payload = await response.json();
      if (response.ok && payload.recommendation) {
        setRepricedById((prev) => ({
          ...prev,
          [rec.movie.id]: payload.recommendation as MovieRecommendation,
        }));
      }
    } catch {
      // Leave the existing card as-is on failure.
    } finally {
      setRepricingId(null);
    }
  }, [city, date, language, format, time]);

  const handleAddToWatchlist = useCallback(async (movie: PvrMovie) => {
    setAddingWatchlistId(movie.id);
    try {
      await createWatchlistItem({
        title: movie.title,
        poster_url: movie.posterUrl,
        release_date: movie.releaseDate,
        genres: movie.genres,
        priority: 1,
      });
      setAddedWatchlistIds((prev) => new Set(prev).add(movie.id));
      toast.success(`Added “${movie.title}” to your watchlist`);
    } catch {
      toast.error("Couldn't add to watchlist");
    } finally {
      setAddingWatchlistId(null);
    }
  }, [createWatchlistItem]);

  const handleViewSeats = useCallback(async (show: PvrShow) => {
    setSeatShow(show);
    setSeatQuote(null);
    setSeatError(null);
    setSeatLoading(true);
    try {
      const response = await fetch("/api/pvr/seat-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city,
          dated: show.showDate,
          encrypted: show.encrypted,
          showKey: show.showKey,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load seat layout");
      }
      setSeatQuote(payload.quote as PvrSeatQuote);
    } catch (err) {
      setSeatError(err instanceof Error ? err.message : "Failed to load seat layout");
    } finally {
      setSeatLoading(false);
    }
  }, [city]);

  const visibleRecommendations = useMemo(
    () => (data?.recommendations || []).filter((r) => !dismissedIds.has(r.movie.id)),
    [data, dismissedIds]
  );
  const watchlistPlaying = useMemo(
    () => visibleRecommendations.filter((rec) => rec.onWatchlist),
    [visibleRecommendations]
  );
  const watchlistUpcoming = useMemo(
    () => (data?.upcoming || []).filter((movie) => movie.onWatchlist),
    [data]
  );
  const nonWatchlist = useMemo(
    () => visibleRecommendations.filter((rec) => !rec.onWatchlist),
    [visibleRecommendations]
  );
  const forYou = useMemo(() => nonWatchlist.slice(0, FOR_YOU_LIMIT), [nonWatchlist]);
  const alsoPlaying = useMemo(() => nonWatchlist.slice(FOR_YOU_LIMIT), [nonWatchlist]);
  const pulledList = useMemo(
    () => Object.values(pulledById).filter((rec) => !dismissedIds.has(rec.movie.id)),
    [pulledById, dismissedIds]
  );
  const nowPlaying = useMemo(
    () =>
      (data?.otherPlaying || []).filter(
        (movie) => !pulledById[movie.id] && !dismissedIds.has(movie.id)
      ),
    [data, pulledById, dismissedIds]
  );
  const dismissalGroups = useMemo(() => {
    const groups = new Map<string, PersistedDismissal[]>();
    for (const row of persistedDismissals) {
      const current = groups.get(row.pvr_movie_id) || [];
      current.push(row);
      groups.set(row.pvr_movie_id, current);
    }
    return Array.from(groups.values());
  }, [persistedDismissals]);

  // Prefer the freshly-repriced version of a card when the user has fetched exact prices.
  const withReprice = (rec: MovieRecommendation): MovieRecommendation =>
    repricedById[rec.movie.id] || rec;

  const watchlistStateFor = (movieId: string): "none" | "adding" | "added" =>
    addingWatchlistId === movieId
      ? "adding"
      : addedWatchlistIds.has(movieId)
        ? "added"
        : "none";

  const todayStr = todayInIndia();
  const chips = dateChips(todayStr);
  const filtersActive =
    language !== "ALL" || format !== "ALL" || time !== DEFAULT_TIME || date !== todayStr;
  const clearFilters = () => {
    setLanguage("ALL");
    setFormat("ALL");
    setTime(DEFAULT_TIME);
    setDate(todayStr);
  };

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
            min={todayStr}
            max={addDays(todayStr, MAX_BOOKING_DAYS_AHEAD)}
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

        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => setDate(chip.value)}
              className={`rounded-full px-3 py-1 text-xs transition ${
                date === chip.value
                  ? "bg-primary/15 text-primary"
                  : "bg-card/40 text-muted-foreground hover:bg-card/60"
              }`}
            >
              {chip.label}
            </button>
          ))}
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1 rounded-full px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground"
            >
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}
        </div>

        {data && (
          <section className="rounded-xl bg-card/35 p-3 text-xs text-muted-foreground">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-base font-bold text-foreground">
                  {visibleRecommendations.length}
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
              <details className="mt-2 text-muted-foreground/70">
                <summary className="cursor-pointer list-none">
                  {data.diagnostics.errors.length} PVR{" "}
                  {data.diagnostics.errors.length === 1 ? "check" : "checks"} failed — the list
                  uses the available results. Tap for details.
                </summary>
                <ul className="mt-1 space-y-0.5 pl-3">
                  {data.diagnostics.errors.map((item) => (
                    <li key={item} className="list-disc">{item}</li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}

        {data && (
          <details className="rounded-xl bg-card/35 px-3 py-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer list-none font-medium">What do these mean?</summary>
            <ul className="mt-2 space-y-1.5">
              <li><span className="font-medium text-foreground">predicted</span> — the rating we think you&apos;d give it (out of 10), from your Movie Log history.</li>
              <li><span className="font-medium text-foreground">confidence</span> — how sure that prediction is, based on how much relevant history you have.</li>
              <li><span className="font-medium text-foreground">vs crowd</span> — how your predicted rating compares to the blended public score (TMDB + Letterboxd, vote-weighted; + above the crowd, − below).</li>
              <li><span className="font-medium text-foreground">Value</span> — predicted enjoyment per rupee; higher means more bang for the ticket price.</li>
              <li><span className="font-medium text-foreground">fast price</span> = estimate from PVR&apos;s range; <span className="font-medium text-foreground">exact price</span> = confirmed from the live seat map.</li>
            </ul>
          </details>
        )}

        {/* Keep the previous results visible (dimmed) while a refetch runs —
            skeletons only on the very first load. */}
        <div
          className={
            isLoading && data
              ? "pointer-events-none space-y-4 opacity-50 transition-opacity"
              : "space-y-4 transition-opacity"
          }
        >
        {isLoading && !data ? (
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
        ) : data && (nonWatchlist.length > 0 || watchlistPlaying.length > 0 || watchlistUpcoming.length > 0 || pulledList.length > 0) ? (
          <div className="space-y-6">
            {(watchlistPlaying.length > 0 || watchlistUpcoming.length > 0) && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Bookmark className="h-4 w-4 text-primary" />
                  <h2 className="marquee text-[17px] uppercase leading-none text-foreground/90">From your watchlist</h2>
                  <span className="text-xs text-muted-foreground">
                    {watchlistPlaying.length + watchlistUpcoming.length} titles
                  </span>
                </div>
                <div className="space-y-3">
                  {watchlistPlaying.map((recommendation) => (
                    <RecommendationCard
                      key={recommendation.movie.id}
                      recommendation={withReprice(recommendation)}
                      expanded={expandedId === recommendation.movie.id}
                      onToggle={() => toggleCard(recommendation.movie.id)}
                      onDismiss={handleOpenDismiss}
                      onReprice={handleReprice}
                      repricing={repricingId === recommendation.movie.id}
                      onAddToWatchlist={handleAddToWatchlist}
                      watchlistState={watchlistStateFor(recommendation.movie.id)}
                      onViewSeats={handleViewSeats}
                      showAll={Boolean(showAllById[recommendation.movie.id])}
                      onToggleShowAll={toggleShowAll}
                    />
                  ))}
                </div>
                {watchlistUpcoming.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {watchlistUpcoming.map((movie) => (
                      <UpcomingWatchlistCard key={movie.id} movie={movie} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {(forYou.length > 0 || pulledList.length > 0) && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-primary" />
                  <h2 className="marquee text-[17px] uppercase leading-none text-foreground/90">For you</h2>
                  <span className="text-xs text-muted-foreground">
                    Ranked by how much you&apos;re likely to enjoy them
                  </span>
                </div>
                <div className="space-y-3">
                  {pulledList.map((recommendation) => (
                    <RecommendationCard
                      key={recommendation.movie.id}
                      recommendation={withReprice(recommendation)}
                      expanded={expandedId === recommendation.movie.id}
                      onToggle={() => toggleCard(recommendation.movie.id)}
                      onDismiss={handleOpenDismiss}
                      onReprice={handleReprice}
                      repricing={repricingId === recommendation.movie.id}
                      onAddToWatchlist={handleAddToWatchlist}
                      watchlistState={watchlistStateFor(recommendation.movie.id)}
                      onViewSeats={handleViewSeats}
                      showAll={Boolean(showAllById[recommendation.movie.id])}
                      onToggleShowAll={toggleShowAll}
                    />
                  ))}
                  {forYou.map((recommendation) => (
                    <RecommendationCard
                      key={recommendation.movie.id}
                      recommendation={withReprice(recommendation)}
                      expanded={expandedId === recommendation.movie.id}
                      onToggle={() => toggleCard(recommendation.movie.id)}
                      onDismiss={handleOpenDismiss}
                      onReprice={handleReprice}
                      repricing={repricingId === recommendation.movie.id}
                      onAddToWatchlist={handleAddToWatchlist}
                      watchlistState={watchlistStateFor(recommendation.movie.id)}
                      onViewSeats={handleViewSeats}
                      showAll={Boolean(showAllById[recommendation.movie.id])}
                      onToggleShowAll={toggleShowAll}
                    />
                  ))}
                </div>
              </section>
            )}

            {alsoPlaying.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Ticket className="h-4 w-4 text-muted-foreground" />
                  <h2 className="marquee text-[17px] uppercase leading-none text-foreground/90">Also playing</h2>
                  <span className="text-xs text-muted-foreground">
                    {alsoPlaying.length} more in {data.city}, with showtimes &amp; predicted ratings
                  </span>
                </div>
                <div className="space-y-3">
                  {alsoPlaying.map((recommendation) => (
                    <RecommendationCard
                      key={recommendation.movie.id}
                      recommendation={withReprice(recommendation)}
                      expanded={expandedId === recommendation.movie.id}
                      onToggle={() => toggleCard(recommendation.movie.id)}
                      onDismiss={handleOpenDismiss}
                      onReprice={handleReprice}
                      repricing={repricingId === recommendation.movie.id}
                      onAddToWatchlist={handleAddToWatchlist}
                      watchlistState={watchlistStateFor(recommendation.movie.id)}
                      onViewSeats={handleViewSeats}
                      showAll={Boolean(showAllById[recommendation.movie.id])}
                      onToggleShowAll={toggleShowAll}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : data && nowPlaying.length > 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <Sparkles className="mx-auto mb-2 h-7 w-7 text-muted-foreground/50" />
            <p className="text-sm font-medium">No ranked picks for these filters</p>
            <p className="mt-1 text-xs text-muted-foreground">
              But there are titles playing in {data.city} below — tap “Get showtimes” on any of them.
            </p>
          </div>
        ) : data && data.diagnostics.errors.length > 0 && data.diagnostics.showCount === 0 ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-8 text-center">
            <p className="text-sm font-medium text-amber-300">PVR didn&apos;t respond</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The cinema data source is unavailable right now. Wait a moment and refresh.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setRefreshKey((value) => value + 1)}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        ) : filtersActive ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <Sparkles className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No movies match your filters</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your language, format, time, or date filter is too narrow.
            </p>
            <Button size="sm" variant="outline" className="mt-3" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" /> Clear filters
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <Sparkles className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No live PVR sessions found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try another city or date.
            </p>
          </div>
        )}

        {data && nowPlaying.length > 0 && (
          <details className="group rounded-xl bg-card/35 p-3" open>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
              <div>
                <h2 className="marquee text-[17px] uppercase leading-none text-foreground/90">More now playing in {data.city}</h2>
                <p className="text-xs text-muted-foreground">
                  {nowPlaying.length} more — tap “Get showtimes” to add one to For you
                </p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {nowPlaying.map((movie) => (
                <OtherPlayingCard
                  key={movie.id}
                  movie={movie}
                  pulling={pullingId === movie.id}
                  error={pullErrorById[movie.id] || null}
                  onPull={handlePull}
                  onAddToWatchlist={handleAddToWatchlist}
                  watchlistState={watchlistStateFor(movie.id)}
                />
              ))}
            </div>
          </details>
        )}

        {dismissalGroups.length > 0 && (
          <details className="group rounded-xl bg-card/35 p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
              <div>
                <h2 className="marquee text-[17px] uppercase leading-none text-foreground/90">Not interested</h2>
                <p className="text-xs text-muted-foreground">
                  {dismissalGroups.length} hidden{" "}
                  {dismissalGroups.length === 1 ? "title" : "titles"} — undo to see them again
                </p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 space-y-2">
              {dismissalGroups.map((rows) => (
                <div
                  key={rows[0].pvr_movie_id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-card/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-medium">{rows[0].movie_title}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {dismissalReasonSummary(rows)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 px-2 text-xs"
                    onClick={() => handleUndoDismiss(rows[0].pvr_movie_id)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Undo
                  </Button>
                </div>
              ))}
            </div>
          </details>
        )}
        </div>
      </div>

      {dismissTarget && (
        <DismissalModal
          movie={dismissTarget}
          onDismiss={handleDismiss}
          onClose={() => setDismissTarget(null)}
        />
      )}

      {seatShow && (
        <SeatLayoutModal
          show={seatShow}
          quote={seatQuote}
          loading={seatLoading}
          error={seatError}
          onClose={() => setSeatShow(null)}
        />
      )}
    </div>
  );
}
