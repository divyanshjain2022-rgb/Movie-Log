"use client";

import { useState } from "react";
import { Plus, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared";
import { useGiftCards, useCreateGiftCard } from "@/hooks";
import { formatCurrency, formatDate } from "@/lib/formula";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function GiftCardsPage() {
  const { giftCards, isLoading, refetch } = useGiftCards();
  const { createGiftCard, isLoading: isCreating } = useCreateGiftCard();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleCreateGiftCard = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      await createGiftCard({
        user_id: "", // Will be set by RLS
        face_value: parseFloat(formData.get("face_value") as string),
        amount_paid: parseFloat(formData.get("amount_paid") as string),
        purchase_date: formData.get("purchase_date") as string,
        expiry_date: formData.get("expiry_date") as string,
        code: (formData.get("code") as string) || null,
        notes: (formData.get("notes") as string) || null,
      });

      toast.success("Gift card added!");
      setIsDialogOpen(false);
      refetch();
    } catch (error) {
      toast.error("Failed to add gift card");
      console.error(error);
    }
  };

  const activeCards = giftCards.filter((gc) => gc.status === "active");
  const exhaustedCards = giftCards.filter((gc) => gc.status === "exhausted");
  const expiredCards = giftCards.filter((gc) => gc.status === "expired");

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Gift Cards"
        action={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="icon" className="h-9 w-9">
                <Plus className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Gift Card</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateGiftCard} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="face_value">Face Value</Label>
                    <Input
                      id="face_value"
                      name="face_value"
                      type="number"
                      step="0.01"
                      required
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
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="purchase_date">Purchase Date</Label>
                    <Input
                      id="purchase_date"
                      name="purchase_date"
                      type="date"
                      required
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
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="code">Code (optional)</Label>
                  <Input id="code" name="code" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Input id="notes" name="notes" className="mt-1" />
                </div>
                <Button type="submit" className="w-full" disabled={isCreating}>
                  {isCreating ? "Adding..." : "Add Gift Card"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

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
            {/* Active Cards */}
            {activeCards.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                  Active ({activeCards.length})
                </h2>
                <div className="space-y-3">
                  {activeCards.map((gc) => (
                    <GiftCardItem key={gc.id} giftCard={gc} />
                  ))}
                </div>
              </section>
            )}

            {/* Exhausted Cards */}
            {exhaustedCards.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                  Exhausted ({exhaustedCards.length})
                </h2>
                <div className="space-y-3">
                  {exhaustedCards.map((gc) => (
                    <GiftCardItem key={gc.id} giftCard={gc} />
                  ))}
                </div>
              </section>
            )}

            {/* Expired Cards */}
            {expiredCards.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                  Expired ({expiredCards.length})
                </h2>
                <div className="space-y-3">
                  {expiredCards.map((gc) => (
                    <GiftCardItem key={gc.id} giftCard={gc} />
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

function GiftCardItem({ giftCard: gc }: { giftCard: ReturnType<typeof useGiftCards>["giftCards"][0] }) {
  const daysUntilExpiry = Math.ceil(
    (new Date(gc.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  const isExpiringSoon = gc.status === "active" && daysUntilExpiry <= 30;

  return (
    <Card className={cn(gc.status !== "active" && "opacity-60")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
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
        </div>
      </CardContent>
    </Card>
  );
}
