"use client";

import { useState, useRef } from "react";
import { Plus, CreditCard, MoreHorizontal, Pencil, Trash2, Camera, Loader2 } from "lucide-react";
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
import { useNow } from "@/hooks/use-now";
import { daysUntil } from "@/lib/date-utils";
import { formatCurrency, formatDate } from "@/lib/formula";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { GiftCardWithUsage, GiftCardOCRData } from "@/types";

interface ExtractedGiftCardData {
  card_number: string | null;
  pin: string | null;
  face_value: number | null;
  expiry_date: string | null;
  platform: string | null;
}

export default function GiftCardsPage() {
  const { giftCards, isLoading, refetch } = useGiftCards();
  const { platforms } = useLookupData();
  const { createGiftCard, isLoading: isCreating } = useCreateGiftCard();
  const { updateGiftCard, isLoading: isUpdating } = useUpdateGiftCard();
  const { deleteGiftCard, isLoading: isDeleting } = useDeleteGiftCard();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<GiftCardWithUsage | null>(null);
  const [deletingCard, setDeletingCard] = useState<GiftCardWithUsage | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedGiftCardData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleScanGiftCard = async (file: File) => {
    setIsScanning(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await fetch("/api/ocr/gift-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 }),
      });

      if (!response.ok) {
        throw new Error("OCR request failed");
      }

      const data: GiftCardOCRData = await response.json();

      // If no expiry date found, default to 15 days from today
      let expiryDate = data.expiry_date;
      if (!expiryDate) {
        const defaultExpiry = new Date();
        defaultExpiry.setDate(defaultExpiry.getDate() + 15);
        expiryDate = defaultExpiry.toISOString().split("T")[0];
      }

      setExtractedData({
        card_number: data.card_number,
        pin: data.pin,
        face_value: data.face_value,
        expiry_date: expiryDate,
        platform: data.platform,
      });

      setIsAddDialogOpen(true);
      toast.success("Gift card data extracted!");
    } catch (error) {
      toast.error("Failed to scan gift card. Try entering manually.");
      console.error(error);
      setIsAddDialogOpen(true);
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleScanGiftCard(file);
    }
  };

  const handleCreateGiftCard = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const platformId = formData.get("platform_id") as string;

    try {
      await createGiftCard({
        user_id: "", // Will be set by RLS
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
      toast.error("Failed to add gift card");
      console.error(error);
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

  // Match platform by name from OCR
  const matchPlatformByName = (name: string | null): string | undefined => {
    if (!name || !platforms.length) return undefined;
    const search = name.toLowerCase();
    const match = platforms.find(p =>
      p.name.toLowerCase().includes(search) ||
      search.includes(p.name.toLowerCase())
    );
    return match?.id;
  };

  // Format code with PIN for display
  const formatCodeWithPin = (cardNumber: string | null, pin: string | null): string => {
    if (!cardNumber && !pin) return "";
    if (cardNumber && pin) return `${cardNumber} | PIN: ${pin}`;
    return cardNumber || pin || "";
  };

  const GiftCardForm = ({
    card,
    extracted,
    onSubmit,
    isSubmitting
  }: {
    card?: GiftCardWithUsage;
    extracted?: ExtractedGiftCardData | null;
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
    isSubmitting: boolean;
  }) => {
    // Determine default values - extracted data takes priority for new cards
    const defaultFaceValue = card?.face_value ?? extracted?.face_value ?? undefined;
    const defaultPurchaseDate = card?.purchase_date ?? new Date().toISOString().split("T")[0];
    const defaultExpiryDate = card?.expiry_date ?? extracted?.expiry_date ?? "";
    const defaultCode = card?.code ?? formatCodeWithPin(extracted?.card_number ?? null, extracted?.pin ?? null);
    const defaultPlatformId = card?.platform?.id ?? matchPlatformByName(extracted?.platform ?? null) ?? "";

    return (
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
              defaultValue={defaultFaceValue}
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
              defaultValue={card?.amount_paid ?? defaultFaceValue}
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="platform_id">Platform</Label>
          <Select name="platform_id" defaultValue={defaultPlatformId}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select platform" />
            </SelectTrigger>
            <SelectContent>
              {platforms.map((platform) => (
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
              defaultValue={defaultPurchaseDate}
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
              defaultValue={defaultExpiryDate}
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="code">Card ID / PIN</Label>
          <Input
            id="code"
            name="code"
            defaultValue={defaultCode}
            placeholder="e.g., 1234567890 | PIN: 1234"
            className="mt-1 font-mono"
          />
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
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setIsAddDialogOpen(false);
      setExtractedData(null);
    }
  };

  return (
    <div className="min-h-screen pb-20">
      {/* Hidden file input for scanning */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleFileSelect}
      />

      <PageHeader
        title="Gift Cards"
        action={
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9"
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning}
            >
              {isScanning ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Camera className="h-5 w-5" />
              )}
            </Button>
            <Button size="icon" className="h-9 w-9" onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        }
      />

      {/* Add Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Gift Card</DialogTitle>
          </DialogHeader>
          <GiftCardForm
            extracted={extractedData}
            onSubmit={handleCreateGiftCard}
            isSubmitting={isCreating}
          />
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
  const [showCode, setShowCode] = useState(false);
  // Frozen at mount rather than read during render: the cards are fetched
  // client-side anyway, so there is no visible delay, and a clock read in
  // render drifts between re-renders and disagrees with the server HTML.
  const now = useNow();
  const daysUntilExpiry = now === null ? null : daysUntil(gc.expiry_date, now);
  const isExpiringSoon =
    gc.status === "active" && daysUntilExpiry !== null && daysUntilExpiry <= 30;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

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

            {/* Code/PIN Display */}
            {gc.code && (
              <div className="mt-3 space-y-1">
                <button
                  onClick={() => setShowCode(!showCode)}
                  className="text-xs text-primary hover:underline"
                >
                  {showCode ? "Hide" : "Show"} Card ID/PIN
                </button>
                {showCode && (
                  <div className="rounded-lg bg-secondary/50 p-2 font-mono text-sm">
                    <button
                      onClick={() => copyToClipboard(gc.code!)}
                      className="w-full text-left hover:text-primary transition-colors"
                      title="Click to copy"
                    >
                      {gc.code}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            {gc.notes && (
              <p className="mt-2 text-xs text-muted-foreground italic">
                {gc.notes}
              </p>
            )}
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
