"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { RatingSlider } from "./rating-slider";
import { Plus, X } from "lucide-react";
import { formatCurrency } from "@/lib/formula";
import type {
  Format,
  Theater,
  Mood,
  Aspect,
  RewatchOption,
  GiftCardWithUsage,
  MovieFormData,
  GiftCardUsageEntry,
} from "@/types";

const movieFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  date: z.string().min(1, "Date is required"),
  showtime: z.string().optional(),
  theater_id: z.string().optional(),
  audi: z.string().optional(),
  format_id: z.string().optional(),
  seat: z.string().optional(),
  ticket_cost: z.coerce.number().min(0).default(0),
  convenience_fee: z.coerce.number().min(0).default(0),
  booking_id: z.string().optional(),
  rating: z.coerce.number().min(1).max(10).optional(),
  mood_id: z.string().optional(),
  fnb_cost: z.coerce.number().min(0).optional(),
  fnb_items: z.string().optional(),
  strongest_part_id: z.string().optional(),
  weakest_part_id: z.string().optional(),
  rewatch_id: z.string().optional(),
  review: z.string().optional(),
  remarks: z.string().optional(),
  other_expenses: z.coerce.number().min(0).optional(),
  passport_savings: z.coerce.number().min(0).optional(),
  // TMDB fields - required for saving movie metadata
  tmdb_id: z.coerce.number().optional(),
  runtime_minutes: z.coerce.number().optional(),
  genres: z.array(z.string()).optional(),
  language: z.string().optional(),
  director: z.string().optional(),
  poster_url: z.string().optional(),
});

type MovieFormValues = z.infer<typeof movieFormSchema>;

interface MovieFormProps {
  initialData?: Partial<MovieFormData>;
  formats: Format[];
  theaters: Theater[];
  moods: Mood[];
  aspects: Aspect[];
  rewatchOptions: RewatchOption[];
  giftCards: GiftCardWithUsage[];
  onSubmit: (data: MovieFormData, giftCardUsage?: GiftCardUsageEntry[]) => Promise<void>;
  isLoading?: boolean;
  isEditing?: boolean;
  isAdvanceBooking?: boolean;
  initialGiftCardUsage?: GiftCardUsageEntry[];
}

export function MovieForm({
  initialData,
  formats,
  theaters,
  moods,
  aspects,
  rewatchOptions,
  giftCards,
  onSubmit,
  isLoading = false,
  isEditing = false,
  isAdvanceBooking = false,
  initialGiftCardUsage = [],
}: MovieFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<MovieFormValues>({
    resolver: zodResolver(movieFormSchema),
    defaultValues: {
      title: initialData?.title || "",
      date: initialData?.date || new Date().toISOString().split("T")[0],
      showtime: initialData?.showtime || "",
      theater_id: initialData?.theater_id || "",
      audi: initialData?.audi || "",
      format_id: initialData?.format_id || "",
      seat: initialData?.seat || "",
      ticket_cost: initialData?.ticket_cost || 0,
      convenience_fee: initialData?.convenience_fee || 0,
      booking_id: initialData?.booking_id || "",
      rating: initialData?.rating || 5,
      mood_id: initialData?.mood_id || "",
      fnb_cost: initialData?.fnb_cost || 0,
      fnb_items: initialData?.fnb_items || "",
      strongest_part_id: initialData?.strongest_part_id || "",
      weakest_part_id: initialData?.weakest_part_id || "",
      rewatch_id: initialData?.rewatch_id || "",
      review: initialData?.review || "",
      remarks: initialData?.remarks || "",
      other_expenses: initialData?.other_expenses || 0,
      passport_savings: initialData?.passport_savings || 0,
    },
  });

  const rating = watch("rating") || 5;

  // State for multiple gift card selection
  const [giftCardUsage, setGiftCardUsage] = useState<GiftCardUsageEntry[]>(initialGiftCardUsage);

  // Filter out already selected gift cards
  const availableGiftCards = giftCards.filter(
    gc => gc.status === "active" && !giftCardUsage.some(u => u.gift_card_id === gc.id)
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

  // Sync form with initialData changes (e.g., when TMDB or OCR updates data)
  useEffect(() => {
    if (initialData) {
      // Only update fields that have changed
      if (initialData.title !== undefined) setValue("title", initialData.title);
      if (initialData.date !== undefined) setValue("date", initialData.date);
      if (initialData.showtime !== undefined) setValue("showtime", initialData.showtime);
      if (initialData.theater_id !== undefined) setValue("theater_id", initialData.theater_id);
      if (initialData.format_id !== undefined) setValue("format_id", initialData.format_id);
      if (initialData.audi !== undefined) setValue("audi", initialData.audi);
      if (initialData.seat !== undefined) setValue("seat", initialData.seat);
      if (initialData.ticket_cost !== undefined) setValue("ticket_cost", initialData.ticket_cost);
      if (initialData.convenience_fee !== undefined) setValue("convenience_fee", initialData.convenience_fee);
      if (initialData.booking_id !== undefined) setValue("booking_id", initialData.booking_id);
      // TMDB fields
      if (initialData.tmdb_id !== undefined) setValue("tmdb_id", initialData.tmdb_id);
      if (initialData.runtime_minutes !== undefined) setValue("runtime_minutes", initialData.runtime_minutes);
      if (initialData.genres !== undefined) setValue("genres", initialData.genres);
      if (initialData.language !== undefined) setValue("language", initialData.language);
      if (initialData.director !== undefined) setValue("director", initialData.director);
      if (initialData.poster_url !== undefined) setValue("poster_url", initialData.poster_url);
    }
  }, [initialData, setValue]);

  const onFormSubmit = async (data: MovieFormValues) => {
    await onSubmit(data as MovieFormData, giftCardUsage.length > 0 ? giftCardUsage : undefined);
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      {/* Ticket Data Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">
            Extracted from ticket
          </span>
          <Separator className="flex-1" />
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="title">Movie *</Label>
            <Input
              id="title"
              {...register("title")}
              placeholder="Movie title"
              className="mt-1"
            />
            {errors.title && (
              <p className="mt-1 text-xs text-destructive">
                {errors.title.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                {...register("date")}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="showtime">Showtime</Label>
              <Input
                id="showtime"
                type="time"
                {...register("showtime")}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="theater_id">Theater</Label>
            <Select
              value={watch("theater_id")}
              onValueChange={(value) => setValue("theater_id", value)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select theater" />
              </SelectTrigger>
              <SelectContent>
                {theaters.map((theater) => (
                  <SelectItem key={theater.id} value={theater.id}>
                    {theater.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="format_id">Format</Label>
              <Select
                value={watch("format_id")}
                onValueChange={(value) => setValue("format_id", value)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  {formats.map((format) => (
                    <SelectItem key={format.id} value={format.id}>
                      {format.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="audi">Audi/Screen</Label>
              <Input
                id="audi"
                {...register("audi")}
                placeholder="Screen 4"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="seat">Seat</Label>
            <Input
              id="seat"
              {...register("seat")}
              placeholder="G12, G13"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ticket_cost">Ticket Cost</Label>
              <Input
                id="ticket_cost"
                type="number"
                step="0.01"
                {...register("ticket_cost")}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="convenience_fee">Conv. Fee</Label>
              <Input
                id="convenience_fee"
                type="number"
                step="0.01"
                {...register("convenience_fee")}
                className="mt-1"
              />
            </div>
          </div>
        </div>
      </div>

      {/* User Experience Section - Hidden in Advance Booking Mode */}
      {!isAdvanceBooking && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">Your experience</span>
            <Separator className="flex-1" />
          </div>

          <div className="space-y-4">
            <RatingSlider
              value={rating}
              onChange={(value) => setValue("rating", value)}
            />

            <div>
              <Label htmlFor="mood_id">Mood *</Label>
              <Select
                value={watch("mood_id")}
                onValueChange={(value) => setValue("mood_id", value)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="How did you feel?" />
                </SelectTrigger>
                <SelectContent>
                  {moods.map((mood) => (
                    <SelectItem key={mood.id} value={mood.id}>
                      {mood.emoji && `${mood.emoji} `}
                      {mood.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="strongest_part_id">Strongest Part</Label>
                <Select
                  value={watch("strongest_part_id")}
                  onValueChange={(value) => setValue("strongest_part_id", value)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {aspects.map((aspect) => (
                      <SelectItem key={aspect.id} value={aspect.id}>
                        {aspect.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="weakest_part_id">Weakest Part</Label>
                <Select
                  value={watch("weakest_part_id")}
                  onValueChange={(value) => setValue("weakest_part_id", value)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {aspects.map((aspect) => (
                      <SelectItem key={aspect.id} value={aspect.id}>
                        {aspect.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="rewatch_id">Rewatch Value</Label>
              <Select
                value={watch("rewatch_id")}
                onValueChange={(value) => setValue("rewatch_id", value)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Would you watch again?" />
                </SelectTrigger>
                <SelectContent>
                  {rewatchOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Additional Info Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">Additional info</span>
          <Separator className="flex-1" />
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="fnb_cost">F&B Cost</Label>
              <Input
                id="fnb_cost"
                type="number"
                step="0.01"
                {...register("fnb_cost")}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="other_expenses">Other Expenses</Label>
              <Input
                id="other_expenses"
                type="number"
                step="0.01"
                {...register("other_expenses")}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="fnb_items">F&B Items</Label>
            <Input
              id="fnb_items"
              {...register("fnb_items")}
              placeholder="Popcorn, Coke..."
              className="mt-1"
            />
          </div>

          {/* Gift Cards - Multi Select */}
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
                      <div className="flex items-center justify-between gap-2">
                        <span>{gc.platform?.name || "Gift Card"}</span>
                        <span className="text-muted-foreground">
                          {formatCurrency(gc.balance)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {giftCardUsage.length === 0 && availableGiftCards.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">No active gift cards available</p>
            )}
          </div>

          {!isAdvanceBooking && (
            <div>
              <Label htmlFor="review">Review</Label>
              <textarea
                id="review"
                {...register("review")}
                placeholder="Your thoughts on the movie..."
                className="mt-1 min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}

          <div>
            <Label htmlFor="remarks">Remarks</Label>
            <textarea
              id="remarks"
              {...register("remarks")}
              placeholder={isAdvanceBooking ? "Booking notes..." : "Any additional notes..."}
              className="mt-1 min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Saving..." : isEditing ? "Save Changes" : isAdvanceBooking ? "Save Advance Booking" : "Save Entry"}
      </Button>
    </form>
  );
}
