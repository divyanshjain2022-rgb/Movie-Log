"use client";

import { useState } from "react";
import { Plus, Coffee, MoreHorizontal, Pencil, Trash2, Link2, X } from "lucide-react";
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
import type { FnbPurchaseWithRelations, GiftCardUsageEntry, GiftCardWithUsage } from "@/types";

export default function FnbPage() {
  const { fnbPurchases, isLoading, refetch } = useFnbPurchases();
  const { theaters } = useLookupData();
  const { movies } = useMovies();
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

  const linkedPurchases = fnbPurchases.filter(p => p.movie_id);
  const unlinkedPurchases = fnbPurchases.filter(p => !p.movie_id);

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
        title="F&B Purchases"
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

      <div className="space-y-6 p-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : fnbPurchases.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Coffee className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-3 text-muted-foreground">No F&B purchases yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Track your popcorn and snacks separately
            </p>
          </div>
        ) : (
          <>
            {unlinkedPurchases.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                  Unlinked ({unlinkedPurchases.length})
                </h2>
                <div className="space-y-3">
                  {unlinkedPurchases.map((purchase) => (
                    <FnbCard
                      key={purchase.id}
                      purchase={purchase}
                      onEdit={() => setEditingPurchase(purchase)}
                      onDelete={() => setDeletingPurchase(purchase)}
                      onLink={() => setLinkingPurchase(purchase)}
                    />
                  ))}
                </div>
              </section>
            )}

            {linkedPurchases.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                  Linked to Movies ({linkedPurchases.length})
                </h2>
                <div className="space-y-3">
                  {linkedPurchases.map((purchase) => (
                    <FnbCard
                      key={purchase.id}
                      purchase={purchase}
                      onEdit={() => setEditingPurchase(purchase)}
                      onDelete={() => setDeletingPurchase(purchase)}
                      onLink={() => setLinkingPurchase(purchase)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FnbCard({
  purchase,
  onEdit,
  onDelete,
  onLink,
}: {
  purchase: FnbPurchaseWithRelations;
  onEdit: () => void;
  onDelete: () => void;
  onLink: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Coffee className="h-4 w-4 text-primary" />
              <span className="font-medium truncate">{purchase.items}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDate(purchase.date)}
              {purchase.theater && ` at ${purchase.theater.name}`}
            </p>
            {purchase.movie && (
              <p className="mt-1 text-xs text-primary">
                Linked: {purchase.movie.title}
              </p>
            )}
            {purchase.remarks && (
              <p className="mt-1 text-xs text-muted-foreground italic">
                {purchase.remarks}
              </p>
            )}
          </div>
          <div className="flex items-start gap-2">
            <p className="text-lg font-bold text-primary">
              {formatCurrency(purchase.cost)}
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onLink}>
                  <Link2 className="mr-2 h-4 w-4" />
                  {purchase.movie_id ? "Change Link" : "Link to Movie"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
