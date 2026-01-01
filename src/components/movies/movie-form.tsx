"use client";

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
import { TMDBSearchInput } from "./tmdb-search-input";
import type {
  Format,
  Theater,
  Mood,
  Aspect,
  RewatchOption,
  GiftCardWithUsage,
  MovieFormData,
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
  gc_id: z.string().optional(),
  other_expenses: z.coerce.number().min(0).optional(),
  passport_savings: z.coerce.number().min(0).optional(),
  // TMDB metadata
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
  onSubmit: (data: MovieFormData) => Promise<void>;
  isLoading?: boolean;
  isEditing?: boolean;
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
      gc_id: initialData?.gc_id || "",
      other_expenses: initialData?.other_expenses || 0,
      passport_savings: initialData?.passport_savings || 0,
      // TMDB metadata defaults
      tmdb_id: initialData?.tmdb_id || undefined,
      runtime_minutes: initialData?.runtime_minutes || undefined,
      genres: initialData?.genres || [],
      language: initialData?.language || "",
      director: initialData?.director || "",
      poster_url: initialData?.poster_url || "",
    },
  });

  const rating = watch("rating") || 5;

  const onFormSubmit = async (data: MovieFormValues) => {
    await onSubmit(data as MovieFormData);
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
            <div className="mt-1">
              <TMDBSearchInput
                value={watch("title") || ""}
                onChange={(title, movieDetails) => {
                  setValue("title", title);
                  if (movieDetails) {
                    // Set all TMDB metadata
                    if (movieDetails.tmdb_id) {
                      setValue("tmdb_id", movieDetails.tmdb_id);
                    }
                    if (movieDetails.runtime_minutes) {
                      setValue("runtime_minutes", movieDetails.runtime_minutes);
                    }
                    if (movieDetails.poster_url) {
                      setValue("poster_url", movieDetails.poster_url);
                    }
                    if (movieDetails.genres) {
                      setValue("genres", movieDetails.genres);
                    }
                    if (movieDetails.language) {
                      setValue("language", movieDetails.language);
                    }
                    if (movieDetails.director) {
                      setValue("director", movieDetails.director);
                    }
                    console.log("[TMDB] Movie populated:", movieDetails);
                  }
                }}
                placeholder="Search for a movie..."
              />
            </div>
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
              value={(watch("theater_id") || undefined) || undefined}
              onValueChange={(value) => setValue("theater_id", value)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select theater" />
              </SelectTrigger>
              <SelectContent>
                {theaters?.length > 0 ? (
                  theaters.filter(t => t.id).map((theater) => (
                    <SelectItem key={theater.id} value={theater.id}>
                      {theater.name}
                    </SelectItem>
                  ))
                ) : (
                  <div className="p-2 text-sm text-muted-foreground">No theaters found</div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="format_id">Format</Label>
              <Select
                value={(watch("format_id") || undefined) || undefined}
                onValueChange={(value) => setValue("format_id", value)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  {formats?.length > 0 ? (
                    formats.filter(f => f.id).map((format) => (
                      <SelectItem key={format.id} value={format.id}>
                        {format.name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-sm text-muted-foreground">No formats found</div>
                  )}
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

      {/* User Experience Section */}
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
              value={(watch("mood_id") || undefined) || undefined}
              onValueChange={(value) => setValue("mood_id", value)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="How did you feel?" />
              </SelectTrigger>
              <SelectContent>
                {moods.filter(m => m.id).map((mood) => (
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
                value={(watch("strongest_part_id") || undefined) || undefined}
                onValueChange={(value) => setValue("strongest_part_id", value)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {aspects.filter(a => a.id).map((aspect) => (
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
                value={(watch("weakest_part_id") || undefined) || undefined}
                onValueChange={(value) => setValue("weakest_part_id", value)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {aspects.filter(a => a.id).map((aspect) => (
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
              value={(watch("rewatch_id") || undefined) || undefined}
              onValueChange={(value) => setValue("rewatch_id", value)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Would you watch again?" />
              </SelectTrigger>
              <SelectContent>
                {rewatchOptions.filter(r => r.id).map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

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

          <div>
            <Label htmlFor="gc_id">Gift Card Used</Label>
            <Select
              value={(watch("gc_id") || "none") || "none"}
              onValueChange={(value) => setValue("gc_id", value === "none" ? "" : value)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {giftCards.map((gc) => (
                  <SelectItem key={gc.id} value={gc.id}>
                    {gc.platform?.name || "Gift Card"} - Balance:{" "}
                    {gc.balance?.toFixed(0) || gc.face_value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="review">Review</Label>
            <textarea
              id="review"
              {...register("review")}
              placeholder="Your thoughts on the movie..."
              className="mt-1 min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div>
            <Label htmlFor="remarks">Remarks</Label>
            <textarea
              id="remarks"
              {...register("remarks")}
              placeholder="Any additional notes..."
              className="mt-1 min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Saving..." : isEditing ? "Save Changes" : "Save Entry"}
      </Button>
    </form>
  );
}
