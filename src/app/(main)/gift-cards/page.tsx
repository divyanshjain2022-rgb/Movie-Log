"use client";

import { useState } from "react";
import { Plus, CreditCard, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { useGiftCards, useCreateGiftCard, useUpdateGiftCard, useDeleteGiftCard, useLookupData } from "@/hooks";
import { formatCurrency, formatDate } from "@/lib/formula";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { GiftCardWithUsage } from "@/types";

export default function GiftCardsPage() {
  const supabase = createClient();
  const { giftCards, isLoading, refetch } = useGiftCards();
  const { platforms } = useLookupData();
  const { createGiftCard, isLoading: isCreating } = useCreateGiftCard();
  const { updateGiftCard, isLoading: isUpdating } = useUpdateGiftCard();
  const { deleteGiftCard, isLoading: isDeleting } = useDeleteGiftCard();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<GiftCardWithUsage | null>(null);
  const [deletingCard, setDeletingCard] = useState<GiftCardWithUsage | null>(null);

  const handleCreateGiftCard = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const platformId = formData.get("platform_id") as string;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("User authentication failed");

      await createGiftCard({
        user_id: user.id,
        face_value: parseFloat(formData.get("face_value") as string),
        amount_paid: parseFloat(formData.get("amount_paid") as string),
        platform_id: platformId || null,
        purchase_date: formData.get("purchase_date") as string,
        expiry_date: formData.get("expiry_date") as string,
        code: (formData.get("code") as string) || null,
        notes: (formData.get("notes") as string) || null,
      });

      toast.success("Gift card added!");
      setIsAddDialogOpen(false);
      refetch();
    } catch (error) {
      console.error("Create gift card error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to add gift card");
    }
  };


  const handleUpdateGiftCard = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingCard) return;

    const formData = new FormData(e.currentTarget);
    const platformId = formData.get("platform_id") as string;

    try {
      await updateGiftCard(editingCard.id, {
        face_value: parseFloat(formData.get("face_value") as string),
        amount_paid: parseFloat(formData.get("amount_paid") as string),
        platform_id: platformId || null,
        purchase_date: formData.get("purchase_date") as string,
        expiry_date: formData.get("expiry_date") as string,
        code: (formData.get("code") as string) || null,
        notes: (formData.get("notes") as string) || null,
      });

      toast.success("Gift card updated!");
      setEditingCard(null);
      refetch();
    } catch (error) {
      toast.error("Failed to update gift card");
      console.error(error);
    }
  };

  const handleDeleteGiftCard = async () => {
    if (!deletingCard) return;

    try {
      await deleteGiftCard(deletingCard.id);
      toast.success("Gift card deleted");
      setDeletingCard(null);
      refetch();
    } catch (error) {
      toast.error("Failed to delete gift card");
      console.error(error);
    }
  };

  const activeCards = giftCards.filter((gc) => gc.status === "active");
  const exhaustedCards = giftCards.filter((gc) => gc.status === "exhausted");
  const expiredCards = giftCards.filter((gc) => gc.status === "expired");

  const GiftCardForm = ({
    card,
    onSubmit,
    isSubmitting
  }: {
    card?: GiftCardWithUsage;
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
    isSubmitting: boolean;
  }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="face_value">Face Value</Label>
          <Input
            id="face_value"
            name="face_value"
            type="number"
            step="0.01"
            required
            defaultValue={card?.face_value}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="amount_paid">Amount Paid</Label>
          <Input
            id="amount_paid"
            name="amount_paid"
            type="number"
            step="0.01"
            required
            defaultValue={card?.amount_paid}
            className="mt-1"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="platform_id">Platform</Label>
        <Select name="platform_id" defaultValue={card?.platform?.id || undefined}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select platform" />
          </SelectTrigger>
          <SelectContent>
            {platforms.filter(p => p.id).map((platform) => (
              <SelectItem key={platform.id} value={platform.id}>
                {platform.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="purchase_date">Purchase Date</Label>
          <Input
            id="purchase_date"
            name="purchase_date"
            type="date"
            required
            defaultValue={card?.purchase_date}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="expiry_date">Expiry Date</Label>
          <Input
            id="expiry_date"
            name="expiry_date"
            type="date"
            required
            defaultValue={card?.expiry_date}
            className="mt-1"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="code">Code (optional)</Label>
        <Input id="code" name="code" defaultValue={card?.code || ""} className="mt-1" />
      </div>
      <div>
        <Label htmlFor="notes">Notes (optional)</Label>
        <Input id="notes" name="notes" defaultValue={card?.notes || ""} className="mt-1" />
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : card ? "Save Changes" : "Add Gift Card"}
      </Button>
    </form>
  );

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Gift Cards"
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
            <DialogTitle>Add Gift Card</DialogTitle>
          </DialogHeader>
          <GiftCardForm onSubmit={handleCreateGiftCard} isSubmitting={isCreating} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingCard} onOpenChange={(open) => !open && setEditingCard(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Gift Card</DialogTitle>
          </DialogHeader>
          {editingCard && (
            <GiftCardForm card={editingCard} onSubmit={handleUpdateGiftCard} isSubmitting={isUpdating} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingCard} onOpenChange={(open) => !open && setDeletingCard(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Gift Card?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this gift card. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGiftCard}
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
        ) : giftCards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <CreditCard className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-3 text-muted-foreground">No gift cards yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tap the + button to add your first gift card
            </p>
          </div>
        ) : (
          <>
            {activeCards.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                  Active ({activeCards.length})
                </h2>
                <div className="space-y-3">
                  {activeCards.map((gc) => (
                    <GiftCardItem
                      key={gc.id}
                      giftCard={gc}
                      onEdit={() => setEditingCard(gc)}
                      onDelete={() => setDeletingCard(gc)}
                    />
                  ))}
                </div>
              </section>
            )}

            {exhaustedCards.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                  Exhausted ({exhaustedCards.length})
                </h2>
                <div className="space-y-3">
                  {exhaustedCards.map((gc) => (
                    <GiftCardItem
                      key={gc.id}
                      giftCard={gc}
                      onEdit={() => setEditingCard(gc)}
                      onDelete={() => setDeletingCard(gc)}
                    />
                  ))}
                </div>
              </section>
            )}

            {expiredCards.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                  Expired ({expiredCards.length})
                </h2>
                <div className="space-y-3">
                  {expiredCards.map((gc) => (
                    <GiftCardItem
                      key={gc.id}
                      giftCard={gc}
                      onEdit={() => setEditingCard(gc)}
                      onDelete={() => setDeletingCard(gc)}
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

function GiftCardItem({
  giftCard: gc,
  onEdit,
  onDelete
}: {
  giftCard: GiftCardWithUsage;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const daysUntilExpiry = Math.ceil(
    (new Date(gc.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  const isExpiringSoon = gc.status === "active" && daysUntilExpiry <= 30;

  return (
    <Card className={cn(gc.status !== "active" && "opacity-60")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {gc.platform?.name || "Gift Card"}
              </span>
              {gc.status === "active" ? (
                isExpiringSoon && (
                  <Badge variant="destructive" className="text-xs">
                    Expiring soon
                  </Badge>
                )
              ) : (
                <Badge variant="secondary" className="text-xs">
                  {gc.status === "exhausted" ? "Used" : "Expired"}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Purchased {formatDate(gc.purchase_date)}
            </p>
            <p className="text-sm text-muted-foreground">
              Expires {formatDate(gc.expiry_date)}
            </p>
          </div>
          <div className="flex items-start gap-2">
            <div className="text-right">
              <p className={cn(
                "text-xl font-bold",
                gc.status === "active" ? "text-positive" : "text-muted-foreground"
              )}>
                {formatCurrency(gc.balance)}
              </p>
              <p className="text-sm text-muted-foreground">
                of {formatCurrency(gc.face_value)}
              </p>
              <p className="text-xs text-muted-foreground">
                {gc.discount_percent.toFixed(0)}% off
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
