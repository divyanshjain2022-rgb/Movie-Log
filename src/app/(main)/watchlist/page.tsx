"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, Clock, ExternalLink, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared";
import { TMDBSearch } from "@/components/movies";
import { PVR_CITIES } from "@/lib/pvr/cities";
import type { PvrMovie } from "@/lib/pvr/types";
import {
  useWatchlist,
  useCreateWatchlistItem,
  useDeleteWatchlistItem,
  useMovies,
  useUpdateWatchlistItem,
} from "@/hooks";
import { watchlistItemMatchesMovie } from "@/lib/watchlist";

const PRIORITY_LABELS = ["Low", "Medium", "High"];
const PRIORITY_COLORS = ["text-muted-foreground", "text-yellow-500", "text-red-500"];

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

function titlesMatch(left: string, right: string): boolean {
  const a = normalizeTitle(left);
  const b = normalizeTitle(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export default function WatchlistPage() {
  const { items, isLoading, refetch } = useWatchlist();
  const { movies: allMovies, isLoading: isMoviesLoading } = useMovies();
  const { createItem, isLoading: isCreating } = useCreateWatchlistItem();
  const { deleteItem } = useDeleteWatchlistItem();
  const { updateItem } = useUpdateWatchlistItem();
  const [showAdd, setShowAdd] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [priority, setPriority] = useState(0);
  const [notes, setNotes] = useState("");
  const [pvrCity, setPvrCity] = useState("Lucknow");
  const [pvrUpcoming, setPvrUpcoming] = useState<PvrMovie[]>([]);
  const [isPvrLoading, setIsPvrLoading] = useState(true);
  const [pvrError, setPvrError] = useState<string | null>(null);
  const [addingPvrMovieId, setAddingPvrMovieId] = useState<string | null>(null);
  const syncingItemIdsRef = useRef<Set<string>>(new Set());

  const unwatched = items.filter((i) => !i.watched_movie_id);
  const watched = items.filter((i) => i.watched_movie_id);
  const visiblePvrUpcoming = useMemo(() => pvrUpcoming.slice(0, 12), [pvrUpcoming]);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchPvrUpcoming() {
      try {
        setIsPvrLoading(true);
        setPvrError(null);
        const params = new URLSearchParams({ city: pvrCity });
        const response = await fetch(`/api/pvr/comingsoon?${params.toString()}`, {
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load PVR upcoming movies");
        }
        setPvrUpcoming((payload.movies || []) as PvrMovie[]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setPvrError(err instanceof Error ? err.message : "Failed to load PVR upcoming movies");
        setPvrUpcoming([]);
      } finally {
        setIsPvrLoading(false);
      }
    }

    fetchPvrUpcoming();
    return () => controller.abort();
  }, [pvrCity]);

  const isOnWatchlist = (movie: PvrMovie) =>
    unwatched.some((item) => titlesMatch(item.title, movie.title));

  const handleAddFromTMDB = async (movie: {
    tmdb_id: number;
    title: string;
    poster_url?: string;
    release_date?: string;
    genres?: string[];
    runtime_minutes?: number;
  }) => {
    try {
      await createItem({
        title: movie.title,
        tmdb_id: movie.tmdb_id,
        poster_url: movie.poster_url || null,
        release_date: movie.release_date || null,
        genres: movie.genres || null,
        runtime_minutes: movie.runtime_minutes || null,
        priority,
        notes: notes || undefined,
      });
      toast.success(`Added "${movie.title}" to watchlist`);
      setShowAdd(false);
      setNotes("");
      setPriority(0);
      refetch();
    } catch {
      toast.error("Failed to add to watchlist");
    }
  };

  const handleAddManual = async () => {
    if (!manualTitle.trim()) return;
    try {
      await createItem({
        title: manualTitle.trim(),
        priority,
        notes: notes || undefined,
      });
      toast.success(`Added "${manualTitle}" to watchlist`);
      setShowAdd(false);
      setManualTitle("");
      setNotes("");
      setPriority(0);
      refetch();
    } catch {
      toast.error("Failed to add");
    }
  };

  const handleAddFromPvr = async (movie: PvrMovie) => {
    if (isOnWatchlist(movie)) return;

    try {
      setAddingPvrMovieId(movie.id);
      await createItem({
        title: movie.title,
        poster_url: movie.posterUrl,
        release_date: movie.releaseDate,
        genres: movie.genres.length > 0 ? movie.genres : null,
        priority: 1,
        notes: `PVR ID: ${movie.id}`,
      });
      toast.success(`Added "${movie.title}" from PVR upcoming`);
      refetch();
    } catch {
      toast.error("Failed to add PVR movie to watchlist");
    } finally {
      setAddingPvrMovieId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteItem(id);
      toast.success("Removed from watchlist");
      refetch();
    } catch {
      toast.error("Failed to remove");
    }
  };

  const handlePriorityChange = async (id: string, newPriority: number) => {
    try {
      await updateItem(id, { priority: newPriority });
      refetch();
    } catch {
      toast.error("Failed to update priority");
    }
  };

  useEffect(() => {
    if (isLoading || isMoviesLoading || unwatched.length === 0) return;

    const loggedMovies = allMovies.filter((movie) => movie.status === "watched");
    if (loggedMovies.length === 0) return;

    const candidates = unwatched
      .map((item) => ({
        item,
        movie: loggedMovies.find((movie) => watchlistItemMatchesMovie(item, movie)),
      }))
      .filter(
        (entry): entry is { item: typeof unwatched[number]; movie: typeof loggedMovies[number] } =>
          Boolean(entry.movie) && !syncingItemIdsRef.current.has(entry.item.id)
      );

    if (candidates.length === 0) return;

    candidates.forEach(({ item }) => syncingItemIdsRef.current.add(item.id));

    let cancelled = false;

    void Promise.all(
      candidates.map(({ item, movie }) =>
        updateItem(item.id, { watched_movie_id: movie.id })
      )
    )
      .then(() => {
        if (!cancelled) {
          void refetch();
        }
      })
      .catch((error) => {
        console.error("Failed to auto-sync logged watchlist items:", error);
      })
      .finally(() => {
        candidates.forEach(({ item }) => syncingItemIdsRef.current.delete(item.id));
      });

    return () => {
      cancelled = true;
    };
  }, [allMovies, isLoading, isMoviesLoading, refetch, unwatched, updateItem]);

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Watchlist"
        showBack
        action={
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button size="icon" className="h-9 w-9">
                <Plus className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add to Watchlist</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <TMDBSearch
                  onSelect={handleAddFromTMDB}
                />
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">or add manually</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div>
                  <Label>Title</Label>
                  <Input
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    placeholder="Movie title"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select
                    value={String(priority)}
                    onValueChange={(v) => setPriority(Number(v))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Low</SelectItem>
                      <SelectItem value="1">Medium</SelectItem>
                      <SelectItem value="2">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional notes..."
                    className="mt-1"
                  />
                </div>
                <Button
                  onClick={handleAddManual}
                  disabled={!manualTitle.trim() || isCreating}
                  className="w-full"
                >
                  {isCreating ? "Adding..." : "Add to Watchlist"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="space-y-5 p-4">
        <section className="rounded-lg border bg-card/30 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Upcoming at PVR</h2>
              <p className="text-xs text-muted-foreground">
                Add PVR upcoming movies directly to your watchlist
              </p>
            </div>
            <Select value={pvrCity} onValueChange={setPvrCity}>
              <SelectTrigger className="w-[132px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PVR_CITIES.map((city) => (
                  <SelectItem key={city.name} value={city.name}>
                    {city.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isPvrLoading ? (
            <div className="flex gap-3 overflow-x-auto pb-1">
              <Skeleton className="h-48 min-w-36 rounded-lg" />
              <Skeleton className="h-48 min-w-36 rounded-lg" />
              <Skeleton className="h-48 min-w-36 rounded-lg" />
            </div>
          ) : pvrError ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {pvrError}
            </div>
          ) : visiblePvrUpcoming.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No PVR upcoming movies found for {pvrCity}.
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {visiblePvrUpcoming.map((movie) => {
                const onWatchlist = isOnWatchlist(movie);
                return (
                  <div
                    key={`${movie.id}-${movie.title}`}
                    className="min-w-40 rounded-lg border bg-background/45 p-2.5"
                  >
                    {movie.posterUrl ? (
                      <img
                        src={movie.posterUrl}
                        alt={movie.title}
                        className="h-40 w-full rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex h-40 w-full items-center justify-center rounded-md bg-secondary text-2xl">
                        🎬
                      </div>
                    )}
                    <p className="mt-2 line-clamp-2 text-sm font-medium">{movie.title}</p>
                    {movie.releaseDate && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays className="h-3 w-3" />
                        {movie.releaseDate}
                      </p>
                    )}
                    {movie.languages.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {movie.languages.slice(0, 2).map((language) => (
                          <Badge key={language} variant="outline" className="rounded-md text-[10px]">
                            {language}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex gap-1.5">
                      <Button
                        size="sm"
                        className="h-8 flex-1"
                        variant={onWatchlist ? "secondary" : "default"}
                        disabled={onWatchlist || addingPvrMovieId === movie.id}
                        onClick={() => handleAddFromPvr(movie)}
                      >
                        {onWatchlist ? "On list" : addingPvrMovieId === movie.id ? "Adding" : "Add"}
                      </Button>
                      <Button asChild size="icon-sm" variant="outline">
                        <a href={movie.redirectUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : unwatched.length === 0 && watched.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Clock className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">Your watchlist is empty</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add movies you want to see
            </p>
          </div>
        ) : (
          <>
            {/* Unwatched */}
            {unwatched.length > 0 && (
              <div className="space-y-3">
                {unwatched.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    {item.poster_url ? (
                      <img
                        src={item.poster_url}
                        alt={item.title}
                        className="h-16 w-11 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-11 items-center justify-center rounded bg-secondary text-lg">
                        🎬
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.title}</p>
                      {item.genres && item.genres.length > 0 && (
                        <p className="text-xs text-muted-foreground truncate">
                          {item.genres.join(", ")}
                        </p>
                      )}
                      {item.release_date && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(item.release_date) > new Date() ? "Releases " : ""}
                          {new Date(item.release_date).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-xs text-muted-foreground italic mt-0.5">
                          {item.notes}
                        </p>
                      )}
                      <div className="mt-2">
                        <Button asChild size="sm" variant="secondary" className="h-7 px-2 text-xs">
                          <Link href={`/movies/new?watchlist=${encodeURIComponent(item.id)}`}>
                            Watched
                          </Link>
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <button
                        aria-label={`Priority: ${PRIORITY_LABELS[item.priority]}`}
                        onClick={() =>
                          handlePriorityChange(item.id, (item.priority + 1) % 3)
                        }
                      >
                        <Star
                          className={`h-4 w-4 ${PRIORITY_COLORS[item.priority]}`}
                          fill={item.priority > 0 ? "currentColor" : "none"}
                        />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Watched section */}
            {watched.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  Watched ({watched.length})
                </h3>
                <div className="space-y-3">
                  {watched.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg border border-dashed p-3 opacity-60"
                    >
                      <Check className="h-4 w-4 text-positive" />
                      <span className="flex-1 truncate text-sm">{item.title}</span>
                      {item.watched_movie_id && (
                        <Link
                          href={`/movies/${item.watched_movie_id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          View
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
