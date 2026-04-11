"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Coffee, MoreHorizontal, Pencil, Trash2, Link2, X, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared";
import {
  useFnbPurchases,
  useCreateFnbPurchase,
  useUpdateFnbPurchase,
  useDeleteFnbPurchase,
  useLookupData,
  useMovies,
  useGiftCards,
} from "@/hooks";
import { formatCurrency, formatDate } from "@/lib/formula";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { FnbPurchaseWithRelations, GiftCardUsageEntry } from "@/types";

// Unified F&B entry — either from fnb_purchases table or from a movie's fnb fields
interface FnbEntry {
  id: string;
  date: string;
  items: string;
  cost: number;
  theaterName?: string;
  movieTitle?: string;
  movieId?: string;
  remarks?: string | null;
  source: "standalone" | "movie";
  // Only for standalone entries
  purchase?: FnbPurchaseWithRelations;
}

export default function FnbPage() {
  const { fnbPurchases, isLoading: fnbLoading, refetch } = useFnbPurchases();
  const { theaters } = useLookupData();
  const { movies, isLoading: moviesLoading } = useMovies();
  const { giftCards } = useGiftCards();
  const { createFnbPurchase, isLoading: isCreating } = useCreateFnbPurchase();
  const { updateFnbPurchase, isLoading: isUpdating } = useUpdateFnbPurchase();
  const { deleteFnbPurchase, isLoading: isDeleting } = useDeleteFnbPurchase();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<FnbPurchaseWithRelations | null>(null);
  const [deletingPurchase, setDeletingPurchase] = useState<FnbPurchaseWithRelations | null>(null);
  const [linkingPurchase, setLinkingPurchase] = useState<FnbPurchaseWithRelations | null>(null);
  const [giftCardUsage, setGiftCardUsage] = useState<GiftCardUsageEntry[]>([]);

  const activeGiftCards = giftCards.filter(gc => gc.status === "active");
  const availableGiftCards = activeGiftCards.filter(
    gc => !giftCardUsage.some(u => u.gift_card_id === gc.id)
  );

  // Merge F&B from both sources
  const allFnbEntries = useMemo(() => {
    const entries: FnbEntry[] = [];

    // From fnb_purchases table
    fnbPurchases.forEach(p => {
      entries.push({
        id: p.id,
        date: p.date,
        items: p.items,
        cost: p.cost,
        theaterName: p.theater?.name,
        movieTitle: p.movie?.title,
        movieId: p.movie_id || undefined,
        remarks: p.remarks,
        source: "standalone",
        purchase: p,
      });
    });

    // From movies with fnb_cost > 0
    movies.forEach(m => {
      if (m.fnb_cost && m.fnb_cost > 0) {
        entries.push({
          id: `movie-${m.id}`,
          date: m.date,
          items: m.fnb_items || "F&B",
          cost: m.fnb_cost,
          theaterName: m.theater?.name,
          movieTitle: m.title,
          movieId: m.id,
          remarks: null,
          source: "movie",
        });
      }
    });

    // Sort by date descending
    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [fnbPurchases, movies]);

  // Stats
  const stats = useMemo(() => {
    const year = new Date().getFullYear();
    const yearEntries = allFnbEntries.filter(e => new Date(e.date).getFullYear() === year);
    const totalSpend = yearEntries.reduce((sum, e) => sum + e.cost, 0);
    const avgPerVisit = yearEntries.length > 0 ? totalSpend / yearEntries.length : 0;
    return { totalSpend, count: yearEntries.length, avgPerVisit };
  }, [allFnbEntries]);

  const addGiftCard = (gcId: string) => {
    const gc = giftCards.find(g => g.id === gcId);
    if (gc) {
      setGiftCardUsage(prev => [...prev, { gift_card_id: gcId, amount_used: gc.balance }]);
    }
  };

  const removeGiftCard = (gcId: string) => {
    setGiftCardUsage(prev => prev.filter(u => u.gift_card_id !== gcId));
  };

  const updateGiftCardAmount = (gcId: string, amount: number) => {
    setGiftCardUsage(prev =>
      prev.map(u => u.gift_card_id === gcId ? { ...u, amount_used: amount } : u)
    );
  };

  const resetGiftCardUsage = () => {
    setGiftCardUsage([]);
  };

  const handleCreateFnbPurchase = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const theaterId = formData.get("theater_id") as string;

    try {
      await createFnbPurchase({
        user_id: "",
        date: formData.get("date") as string,
        theater_id: theaterId === "none" ? null : theaterId || null,
        items: formData.get("items") as string,
        cost: parseFloat(formData.get("cost") as string),
        remarks: (formData.get("remarks") as string) || null,
        movie_id: null,
      }, giftCardUsage.length > 0 ? giftCardUsage : undefined);

      toast.success("F&B purchase added!");
      setIsAddDialogOpen(false);
      resetGiftCardUsage();
      refetch();
    } catch (error) {
      toast.error("Failed to add F&B purchase");
      console.error(error);
    }
  };

  const handleUpdateFnbPurchase = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingPurchase) return;

    const formData = new FormData(e.currentTarget);
    const theaterId = formData.get("theater_id") as string;

    try {
      await updateFnbPurchase(editingPurchase.id, {
        date: formData.get("date") as string,
        theater_id: theaterId === "none" ? null : theaterId || null,
        items: formData.get("items") as string,
        cost: parseFloat(formData.get("cost") as string),
        remarks: (formData.get("remarks") as string) || null,
      });

      toast.success("F&B purchase updated!");
      setEditingPurchase(null);
      refetch();
    } catch (error) {
      toast.error("Failed to update F&B purchase");
      console.error(error);
    }
  };

  const handleLinkToMovie = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!linkingPurchase) return;

    const formData = new FormData(e.currentTarget);
    const movieId = formData.get("movie_id") as string;

    try {
      await updateFnbPurchase(linkingPurchase.id, {
        movie_id: movieId === "none" ? null : movieId,
      });

      toast.success(movieId === "none" ? "Unlinked from movie" : "Linked to movie!");
      setLinkingPurchase(null);
      refetch();
    } catch (error) {
      toast.error("Failed to link F&B purchase");
      console.error(error);
    }
  };

  const handleDeleteFnbPurchase = async () => {
    if (!deletingPurchase) return;

    try {
      await deleteFnbPurchase(deletingPurchase.id);
      toast.success("F&B purchase deleted");
      setDeletingPurchase(null);
      refetch();
    } catch (error) {
      toast.error("Failed to delete F&B purchase");
      console.error(error);
    }
  };

  const isLoading = fnbLoading || moviesLoading;

  const FnbForm = ({
    purchase,
    onSubmit,
    isSubmitting,
  }: {
    purchase?: FnbPurchaseWithRelations;
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
    isSubmitting: boolean;
  }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="date">Date</Label>
        <Input
          id="date"
          name="date"
          type="date"
          required
          defaultValue={purchase?.date || new Date().toISOString().split("T")[0]}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="theater_id">Theater</Label>
        <Select name="theater_id" defaultValue={purchase?.theater?.id || "none"}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select theater" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No theater</SelectItem>
            {theaters.map((theater) => (
              <SelectItem key={theater.id} value={theater.id}>
                {theater.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="items">Items *</Label>
        <Input
          id="items"
          name="items"
          required
          defaultValue={purchase?.items || ""}
          placeholder="Popcorn, Coke, Nachos..."
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="cost">Total Cost *</Label>
        <Input
          id="cost"
          name="cost"
          type="number"
          step="0.01"
          required
          defaultValue={purchase?.cost}
          className="mt-1"
        />
      </div>

      {/* Gift Cards Selection */}
      <div>
        <Label>Gift Cards Used</Label>
        {giftCardUsage.length > 0 && (
          <div className="mt-2 space-y-2">
            {giftCardUsage.map((usage) => {
              const gc = giftCards.find(g => g.id === usage.gift_card_id);
              if (!gc) return null;
              return (
                <div key={usage.gift_card_id} className="flex items-center gap-2 rounded-md border p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {gc.platform?.name || "Gift Card"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Balance: {formatCurrency(gc.balance)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">₹</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={usage.amount_used}
                      onChange={(e) => updateGiftCardAmount(usage.gift_card_id, parseFloat(e.target.value) || 0)}
                      className="h-8 w-20 text-right"
                      max={gc.balance}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeGiftCard(usage.gift_card_id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        {availableGiftCards.length > 0 && (
          <Select onValueChange={addGiftCard} value="">
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Add gift card..." />
            </SelectTrigger>
            <SelectContent>
              {availableGiftCards.map((gc) => (
                <SelectItem key={gc.id} value={gc.id}>
                  {gc.platform?.name || "Gift Card"} - {formatCurrency(gc.balance)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {giftCardUsage.length === 0 && availableGiftCards.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">No active gift cards available</p>
        )}
      </div>

      <div>
        <Label htmlFor="remarks">Notes</Label>
        <Input
          id="remarks"
          name="remarks"
          defaultValue={purchase?.remarks || ""}
          placeholder="Any notes..."
          className="mt-1"
        />
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : purchase ? "Save Changes" : "Add F&B Purchase"}
      </Button>
    </form>
  );

  return (
    <div className="min-h-screen pb-20">
      <PageHeader
        title="F&B"
        action={
          <Button size="icon" className="h-9 w-9" onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="h-5 w-5" />
          </Button>
        }
      />

      {/* Add Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add F&B Purchase</DialogTitle>
          </DialogHeader>
          <FnbForm onSubmit={handleCreateFnbPurchase} isSubmitting={isCreating} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingPurchase} onOpenChange={(open) => !open && setEditingPurchase(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit F&B Purchase</DialogTitle>
          </DialogHeader>
          {editingPurchase && (
            <FnbForm
              purchase={editingPurchase}
              onSubmit={handleUpdateFnbPurchase}
              isSubmitting={isUpdating}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Link to Movie Dialog */}
      <Dialog open={!!linkingPurchase} onOpenChange={(open) => !open && setLinkingPurchase(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link to Movie</DialogTitle>
          </DialogHeader>
          {linkingPurchase && (
            <form onSubmit={handleLinkToMovie} className="space-y-4">
              <div>
                <Label htmlFor="movie_id">Select Movie</Label>
                <Select name="movie_id" defaultValue={linkingPurchase.movie_id || "none"}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select movie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No movie (unlink)</SelectItem>
                    {movies.map((movie) => (
                      <SelectItem key={movie.id} value={movie.id}>
                        {movie.title} ({formatDate(movie.date)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={isUpdating}>
                {isUpdating ? "Linking..." : "Link to Movie"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingPurchase} onOpenChange={(open) => !open && setDeletingPurchase(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete F&B Purchase?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this F&B purchase. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFnbPurchase}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="p-4 space-y-5">
        {/* Year Stats */}
        {!isLoading && allFnbEntries.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-card/50 p-3.5">
              <p className="text-xs text-muted-foreground/60">Total</p>
              <p className="text-lg font-bold">{formatCurrency(stats.totalSpend)}</p>
            </div>
            <div className="rounded-2xl bg-card/50 p-3.5">
              <p className="text-xs text-muted-foreground/60">Orders</p>
              <p className="text-lg font-bold">{stats.count}</p>
            </div>
            <div className="rounded-2xl bg-card/50 p-3.5">
              <p className="text-xs text-muted-foreground/60">Avg/Visit</p>
              <p className="text-lg font-bold">{formatCurrency(stats.avgPerVisit)}</p>
            </div>
          </div>
        )}

        {/* F&B List */}
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : allFnbEntries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Coffee className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-3 text-muted-foreground">No F&B purchases yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Log F&B when adding a movie, or add standalone purchases here
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {allFnbEntries.map((entry) => (
              <Card key={entry.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {entry.source === "movie" ? (
                          <Film className="h-4 w-4 text-primary flex-shrink-0" />
                        ) : (
                          <Coffee className="h-4 w-4 text-primary flex-shrink-0" />
                        )}
                        <span className="font-medium truncate">{entry.items}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatDate(entry.date)}
                        {entry.theaterName && ` · ${entry.theaterName}`}
                      </p>
                      {entry.movieTitle && (
                        <Link
                          href={`/movies/${entry.movieId}`}
                          className="mt-1 inline-block text-xs text-primary hover:underline"
                        >
                          {entry.movieTitle}
                        </Link>
                      )}
                      {entry.remarks && (
                        <p className="mt-1 text-xs text-muted-foreground italic">
                          {entry.remarks}
                        </p>
                      )}
                    </div>
                    <div className="flex items-start gap-2">
                      <p className="text-lg font-bold text-primary">
                        {formatCurrency(entry.cost)}
                      </p>
                      {entry.source === "standalone" && entry.purchase && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setLinkingPurchase(entry.purchase!)}>
                              <Link2 className="mr-2 h-4 w-4" />
                              {entry.purchase.movie_id ? "Change Link" : "Link to Movie"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditingPurchase(entry.purchase!)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDeletingPurchase(entry.purchase!)} className="text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
