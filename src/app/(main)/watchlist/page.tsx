"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Star, Clock, Check } from "lucide-react";
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
import {
  useWatchlist,
  useCreateWatchlistItem,
  useDeleteWatchlistItem,
  useUpdateWatchlistItem,
} from "@/hooks";

const PRIORITY_LABELS = ["Low", "Medium", "High"];
const PRIORITY_COLORS = ["text-muted-foreground", "text-yellow-500", "text-red-500"];

export default function WatchlistPage() {
  const { items, isLoading, refetch } = useWatchlist();
  const { createItem, isLoading: isCreating } = useCreateWatchlistItem();
  const { deleteItem } = useDeleteWatchlistItem();
  const { updateItem } = useUpdateWatchlistItem();
  const [showAdd, setShowAdd] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [priority, setPriority] = useState(0);
  const [notes, setNotes] = useState("");

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

  const unwatched = items.filter((i) => !i.watched_movie_id);
  const watched = items.filter((i) => i.watched_movie_id);

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

      <div className="p-4">
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
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <button
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
