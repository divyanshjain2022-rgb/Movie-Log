"use client";

import { useCallback, useEffect, useState } from "react";
import { type FieldErrors, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
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
import {
  formatAudiDisplay,
  getAudiDefaultForFormat,
  normalizeAudiValue,
} from "@/lib/audi";
import { formatCurrency } from "@/lib/formula";
import { Switch } from "@/components/ui/switch";
import type {
  Format,
  Theater,
  Mood,
  Aspect,
  RewatchOption,
  GiftCardWithUsage,
  MovieFormData,
  GiftCardUsageEntry,
  Franchise,
  Companion,
  MovieWithRelations,
  PassportWithUsage,
} from "@/types";
import { PAYMENT_METHODS, type PaymentMethodEntry } from "@/types/database";
import { tmdbImage } from "@/lib/tmdb-image";

const supabase = createClient();

/** Reusable gift card selector for ticket or F&B */
function GiftCardSelector({
  label,
  usage,
  allGiftCards,
  availableGiftCards,
  onAdd,
  onRemove,
  onUpdateAmount,
}: {
  label: string;
  usage: GiftCardUsageEntry[];
  allGiftCards: GiftCardWithUsage[];
  availableGiftCards: GiftCardWithUsage[];
  onAdd: (gcId: string) => void;
  onRemove: (gcId: string) => void;
  onUpdateAmount: (gcId: string, amount: number) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {usage.length > 0 && (
        <div className="mt-2 space-y-2">
          {usage.map((u) => {
            const gc = allGiftCards.find(g => g.id === u.gift_card_id);
            if (!gc) return null;
            return (
              <div key={u.gift_card_id} className="flex items-center gap-2 rounded-md border p-2">
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
                    value={u.amount_used}
                    onChange={(e) => onUpdateAmount(u.gift_card_id, parseFloat(e.target.value) || 0)}
                    className="h-8 w-20 text-right"
                    max={gc.balance}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(u.gift_card_id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
      {availableGiftCards.length > 0 && (
        <Select onValueChange={onAdd} value="">
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
      {usage.length === 0 && availableGiftCards.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">No active gift cards</p>
      )}
    </div>
  );
}

const optionalNumber = z.preprocess(
  (value) => (value === "" || value === null || Number.isNaN(value) ? undefined : value),
  z.coerce.number().optional()
);

const optionalString = z.preprocess(
  (value) => (value === null ? undefined : value),
  z.string().optional()
);

const optionalStringArray = z.preprocess(
  (value) => (value === null ? undefined : value),
  z.array(z.string()).optional()
);

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
  fnb_cost: optionalNumber.pipe(z.number().min(0).optional()),
  fnb_items: z.string().optional(),
  strongest_part_id: z.string().optional(),
  weakest_part_id: z.string().optional(),
  rewatch_id: z.string().optional(),
  review: z.string().optional(),
  remarks: z.string().optional(),
  other_expenses: optionalNumber.pipe(z.number().min(0).optional()),
  passport_savings: optionalNumber.pipe(z.number().min(0).optional()),
  // TMDB fields
  tmdb_id: optionalNumber,
  runtime_minutes: optionalNumber,
  genres: optionalStringArray,
  language: optionalString,
  director: optionalString,
  poster_url: optionalString,
  // New fields
  watched_with: z.string().optional(),
  // TMDB enrichment
  cast_members: optionalStringArray,
  composer: optionalString,
  cinematographer: optionalString,
  budget: optionalNumber,
  box_office: optionalNumber,
  tmdb_rating: optionalNumber,
  tmdb_vote_count: optionalNumber,
  certification: optionalString,
  trailer_url: optionalString,
  keywords: optionalStringArray,
  overview: optionalString,
  release_date: optionalString,
  // Feature expansion
  franchise_id: z.string().optional(),
  is_rewatch: z.boolean().optional(),
  original_movie_id: z.string().optional(),
  passport_id: z.string().optional(),
});

type MovieFormValues = z.infer<typeof movieFormSchema>;

const fieldLabels: Partial<Record<keyof MovieFormValues, string>> = {
  title: "Movie",
  date: "Date",
  showtime: "Showtime",
  ticket_cost: "Ticket Cost",
  convenience_fee: "Booking Fee",
  rating: "Rating",
  fnb_cost: "F&B Cost",
  other_expenses: "Other Expenses",
  passport_savings: "Passport Savings",
};

function getFirstError(errors: FieldErrors<MovieFormValues>) {
  const [fieldName, fieldError] = Object.entries(errors)[0] as [
    keyof MovieFormValues | undefined,
    { message?: string } | undefined
  ];

  if (!fieldName || !fieldError) {
    return "Check the highlighted fields and try again.";
  }

  const label = fieldLabels[fieldName] || String(fieldName);
  return fieldError.message ? `${label}: ${fieldError.message}` : `${label} is invalid.`;
}

function FieldErrorMessage({ message }: { message?: string }) {
  if (!message) return null;

  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

interface MovieFormProps {
  initialData?: Partial<MovieFormData>;
  formats: Format[];
  theaters: Theater[];
  moods: Mood[];
  aspects: Aspect[];
  rewatchOptions: RewatchOption[];
  giftCards: GiftCardWithUsage[];
  franchises?: Franchise[];
  companions?: Companion[];
  passports?: PassportWithUsage[];
  allMovies?: MovieWithRelations[];
  onSubmit: (data: MovieFormData, giftCardUsage?: GiftCardUsageEntry[]) => Promise<void>;
  isLoading?: boolean;
  isEditing?: boolean;
  isAdvanceBooking?: boolean;
  initialGiftCardUsage?: GiftCardUsageEntry[];
  initialCompanionIds?: string[];
}

export function MovieForm({
  initialData,
  formats,
  theaters,
  moods,
  aspects,
  rewatchOptions,
  giftCards,
  franchises = [],
  companions = [],
  passports = [],
  allMovies = [],
  onSubmit,
  isLoading = false,
  isEditing = false,
  isAdvanceBooking = false,
  initialGiftCardUsage = [],
  initialCompanionIds = [],
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
      passport_id: initialData?.passport_id || "",
      watched_with: initialData?.watched_with || "",
      language: initialData?.language || "",
    },
  });
  const audiField = register("audi");
  const selectedTheaterId = watch("theater_id") || "";
  const selectedFormatId = watch("format_id") || "";
  const audiValue = watch("audi") || "";
  const selectedTheater = theaters.find((theater) => theater.id === selectedTheaterId) || null;
  const selectedFormat = formats.find((format) => format.id === selectedFormatId) || null;
  const [formatDefaultOverrides, setFormatDefaultOverrides] = useState<Record<string, string | null>>({});
  const [lastAppliedDefaultAudi, setLastAppliedDefaultAudi] = useState<string | null>(null);
  const [isSavingFormatDefault, setIsSavingFormatDefault] = useState(false);

  const rating = watch("rating") || 5;

  // State for gift card selection — split by purpose
  const [ticketGiftCards, setTicketGiftCards] = useState<GiftCardUsageEntry[]>(
    initialGiftCardUsage.filter(u => u.purpose !== "fnb")
  );
  const [fnbGiftCards, setFnbGiftCards] = useState<GiftCardUsageEntry[]>(
    initialGiftCardUsage.filter(u => u.purpose === "fnb")
  );

  // State for payment methods
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodEntry[]>(
    (initialData?.payment_methods as PaymentMethodEntry[]) || []
  );

  // State for companions
  const [selectedCompanionIds, setSelectedCompanionIds] = useState<string[]>(initialCompanionIds);

  // State for rewatch
  const [isRewatch, setIsRewatch] = useState(initialData?.is_rewatch || false);

  const selectedTheaterDefaultAudi = getAudiDefaultForFormat(
    selectedTheater?.default_audi_by_format,
    selectedFormatId
  );
  const selectedFormatDefaultAudi = normalizeAudiValue(
    selectedFormat
      ? formatDefaultOverrides[selectedFormat.id] ?? selectedFormat.default_audi
      : null
  );
  const selectedResolvedDefaultAudi = selectedTheaterDefaultAudi || selectedFormatDefaultAudi;
  const selectedResolvedDefaultLabel = formatAudiDisplay(selectedResolvedDefaultAudi);
  const selectedResolvedDefaultSource = selectedTheaterDefaultAudi && selectedTheater
    ? `${selectedTheater.name} for ${selectedFormat?.name}`
    : selectedFormat
      ? `${selectedFormat.name} everywhere`
      : null;

  const addPaymentMethod = () => {
    setPaymentMethods(prev => [...prev, { method: "UPI", amount: 0 }]);
  };

  const removePaymentMethod = (index: number) => {
    setPaymentMethods(prev => prev.filter((_, i) => i !== index));
  };

  const updatePaymentMethod = (index: number, field: "method" | "amount", value: string | number) => {
    setPaymentMethods(prev =>
      prev.map((pm, i) => i === index ? { ...pm, [field]: value } : pm)
    );
  };

  // Filter available gift cards per purpose (same GC can be used for both ticket and fnb)
  const ticketSelectedGcIds = ticketGiftCards.map(u => u.gift_card_id);
  const fnbSelectedGcIds = fnbGiftCards.map(u => u.gift_card_id);

  const availableTicketGiftCards = giftCards.filter(
    gc => gc.status === "active" && !ticketSelectedGcIds.includes(gc.id)
  );
  const availableFnbGiftCards = giftCards.filter(
    gc => gc.status === "active" && !fnbSelectedGcIds.includes(gc.id)
  );

  const addGiftCard = (gcId: string, purpose: "ticket" | "fnb") => {
    const gc = giftCards.find(g => g.id === gcId);
    if (!gc) return;
    const entry: GiftCardUsageEntry = { gift_card_id: gcId, amount_used: gc.balance, purpose };
    if (purpose === "fnb") {
      setFnbGiftCards(prev => [...prev, entry]);
    } else {
      setTicketGiftCards(prev => [...prev, entry]);
    }
  };

  const removeGiftCard = (gcId: string, purpose: "ticket" | "fnb") => {
    if (purpose === "fnb") {
      setFnbGiftCards(prev => prev.filter(u => u.gift_card_id !== gcId));
    } else {
      setTicketGiftCards(prev => prev.filter(u => u.gift_card_id !== gcId));
    }
  };

  const updateGiftCardAmount = (gcId: string, amount: number, purpose: "ticket" | "fnb") => {
    const updater = (prev: GiftCardUsageEntry[]) =>
      prev.map(u => u.gift_card_id === gcId ? { ...u, amount_used: amount } : u);
    if (purpose === "fnb") {
      setFnbGiftCards(updater);
    } else {
      setTicketGiftCards(updater);
    }
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
      // TMDB enrichment
      if (initialData.cast_members !== undefined) setValue("cast_members", initialData.cast_members);
      if (initialData.composer !== undefined) setValue("composer", initialData.composer);
      if (initialData.cinematographer !== undefined) setValue("cinematographer", initialData.cinematographer);
      if (initialData.budget !== undefined) setValue("budget", initialData.budget);
      if (initialData.box_office !== undefined) setValue("box_office", initialData.box_office);
      if (initialData.tmdb_rating !== undefined) setValue("tmdb_rating", initialData.tmdb_rating);
      if (initialData.tmdb_vote_count !== undefined) setValue("tmdb_vote_count", initialData.tmdb_vote_count);
      if (initialData.certification !== undefined) setValue("certification", initialData.certification);
      if (initialData.trailer_url !== undefined) setValue("trailer_url", initialData.trailer_url);
      if (initialData.keywords !== undefined) setValue("keywords", initialData.keywords);
      if (initialData.overview !== undefined) setValue("overview", initialData.overview);
      if (initialData.release_date !== undefined) setValue("release_date", initialData.release_date);
    }
  }, [initialData, setValue]);

  useEffect(() => {
    const normalizedCurrentAudi = normalizeAudiValue(audiValue);

    if (!selectedResolvedDefaultAudi) {
      if (lastAppliedDefaultAudi && normalizedCurrentAudi !== lastAppliedDefaultAudi) {
        setLastAppliedDefaultAudi(null);
      }
      return;
    }

    if (normalizedCurrentAudi === selectedResolvedDefaultAudi && lastAppliedDefaultAudi !== selectedResolvedDefaultAudi) {
      setLastAppliedDefaultAudi(selectedResolvedDefaultAudi);
      return;
    }

    if (!normalizedCurrentAudi || (lastAppliedDefaultAudi && normalizedCurrentAudi === lastAppliedDefaultAudi)) {
      if (normalizedCurrentAudi !== selectedResolvedDefaultAudi) {
        setValue("audi", selectedResolvedDefaultAudi, { shouldDirty: true });
      }
      if (lastAppliedDefaultAudi !== selectedResolvedDefaultAudi) {
        setLastAppliedDefaultAudi(selectedResolvedDefaultAudi);
      }
    }
  }, [audiValue, lastAppliedDefaultAudi, selectedResolvedDefaultAudi, setValue]);

  const normalizeAudiField = useCallback(() => {
    const normalized = normalizeAudiValue(audiValue);
    setValue("audi", normalized || "", { shouldDirty: true, shouldValidate: true });
    if (selectedResolvedDefaultAudi && normalized === selectedResolvedDefaultAudi) {
      setLastAppliedDefaultAudi(selectedResolvedDefaultAudi);
    } else if (normalized !== lastAppliedDefaultAudi) {
      setLastAppliedDefaultAudi(null);
    }
  }, [audiValue, lastAppliedDefaultAudi, selectedResolvedDefaultAudi, setValue]);

  const handleSaveFormatDefault = useCallback(async () => {
    if (!selectedFormat) {
      toast.error("Select a format first");
      return;
    }

    const normalizedAudi = normalizeAudiValue(audiValue);
    if (!normalizedAudi) {
      toast.error("Enter the screen or audi number first");
      return;
    }

    try {
      setIsSavingFormatDefault(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error: formatError } = await supabase
        .from("formats")
        .update({ default_audi: normalizedAudi } as never)
        .eq("id", selectedFormat.id)
        .eq("user_id", user.id);

      if (formatError) throw formatError;

      const { error: moviesError } = await supabase
        .from("movies")
        .update({ audi: normalizedAudi } as never)
        .eq("user_id", user.id)
        .eq("format_id", selectedFormat.id);

      if (moviesError) throw moviesError;

      setFormatDefaultOverrides((current) => ({
        ...current,
        [selectedFormat.id]: normalizedAudi,
      }));
      setLastAppliedDefaultAudi(normalizedAudi);
      setValue("audi", normalizedAudi, { shouldDirty: true, shouldValidate: true });
      toast.success(
        `${selectedFormat.name} now defaults to ${formatAudiDisplay(normalizedAudi) || normalizedAudi}`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save the format default"
      );
    } finally {
      setIsSavingFormatDefault(false);
    }
  }, [audiValue, selectedFormat, setValue]);

  const onFormSubmit = async (data: MovieFormValues) => {
    const formData: MovieFormData = {
      ...data,
      audi: normalizeAudiValue(data.audi) || undefined,
      payment_methods: paymentMethods.length > 0 ? paymentMethods : undefined,
      is_rewatch: isRewatch,
      companion_ids: selectedCompanionIds.length > 0 ? selectedCompanionIds : undefined,
    };
    const allGiftCards = [
      ...ticketGiftCards.map(gc => ({ ...gc, purpose: "ticket" as const })),
      ...fnbGiftCards.map(gc => ({ ...gc, purpose: "fnb" as const })),
    ];
    await onSubmit(formData, allGiftCards.length > 0 ? allGiftCards : undefined);
  };

  const onInvalidSubmit = (formErrors: FieldErrors<MovieFormValues>) => {
    toast.error(getFirstError(formErrors));
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit, onInvalidSubmit)} className="space-y-6" noValidate>
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
              aria-invalid={!!errors.title}
            />
            <FieldErrorMessage message={errors.title?.message} />
          </div>

          {/* TMDB Data Preview - shows when movie is selected from TMDB */}
          {(watch("poster_url") || watch("genres") || watch("runtime_minutes") || watch("director")) && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="flex gap-3">
                {watch("poster_url") && (
                  <img loading="lazy" decoding="async"
                    src={tmdbImage(watch("poster_url"), "w342")}
                    alt={watch("title")}
                    className="h-24 w-16 rounded object-cover shadow"
                  />
                )}
                <div className="flex-1 space-y-1">
                  {watch("genres") && watch("genres")!.length > 0 && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Genre:</span>{" "}
                      {watch("genres")!.join(", ")}
                    </p>
                  )}
                  {watch("runtime_minutes") && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Runtime:</span>{" "}
                      {watch("runtime_minutes")} min
                    </p>
                  )}
                  {watch("director") && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Director:</span>{" "}
                      {watch("director")}
                    </p>
                  )}
                  {watch("cast_members") && watch("cast_members")!.length > 0 && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Cast:</span>{" "}
                      {watch("cast_members")!.join(", ")}
                    </p>
                  )}
                  {watch("composer") && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Composer:</span>{" "}
                      {watch("composer")}
                    </p>
                  )}
                  {watch("cinematographer") && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">DOP:</span>{" "}
                      {watch("cinematographer")}
                    </p>
                  )}
                  {watch("tmdb_rating") && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">TMDB:</span>{" "}
                      {watch("tmdb_rating")}/10
                      {watch("certification") && (
                        <span className="ml-2 rounded border px-1 py-0.5 text-xs font-medium">
                          {watch("certification")}
                        </span>
                      )}
                    </p>
                  )}
                  {(watch("budget") || watch("box_office")) && (
                    <p className="text-sm">
                      {watch("budget") ? (
                        <><span className="text-muted-foreground">Budget:</span> ${(watch("budget")! / 1_000_000).toFixed(0)}M</>
                      ) : null}
                      {watch("budget") && watch("box_office") ? " / " : ""}
                      {watch("box_office") ? (
                        <><span className="text-muted-foreground">Box Office:</span> ${(watch("box_office")! / 1_000_000).toFixed(0)}M</>
                      ) : null}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Language - editable, pre-filled from TMDB */}
          <div>
            <Label htmlFor="language">Language</Label>
            <Input
              id="language"
              {...register("language")}
              placeholder="e.g., English, Hindi, Japanese Dubbed in Hindi"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                {...register("date")}
                className="mt-1"
                aria-invalid={!!errors.date}
              />
              <FieldErrorMessage message={errors.date?.message} />
            </div>
            <div>
              <Label htmlFor="showtime">Showtime</Label>
              <Input
                id="showtime"
                type="time"
                {...register("showtime")}
                className="mt-1"
                aria-invalid={!!errors.showtime}
              />
              <FieldErrorMessage message={errors.showtime?.message} />
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
                {...audiField}
                placeholder="6"
                className="mt-1"
                onBlur={(event) => {
                  audiField.onBlur(event);
                  normalizeAudiField();
                }}
              />
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Prefixes like “Audi 6” and “Screen 6” are normalized automatically.</span>
                {selectedFormat && selectedResolvedDefaultLabel && selectedResolvedDefaultSource && (
                  <span>Saved default for {selectedResolvedDefaultSource}: {selectedResolvedDefaultLabel}</span>
                )}
              </div>
              {selectedFormat && (
                <div className="mt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={handleSaveFormatDefault}
                    disabled={isSavingFormatDefault || !normalizeAudiValue(audiValue)}
                  >
                    {isSavingFormatDefault
                      ? "Saving format default..."
                      : `Save ${formatAudiDisplay(audiValue) || "screen"} for ${selectedFormat.name} everywhere`}
                  </Button>
                </div>
              )}
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
              <Label htmlFor="booking_id">Booking ID</Label>
              <Input
                id="booking_id"
                {...register("booking_id")}
                placeholder="PVR-ABC123"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="passport_savings">Passport Savings</Label>
              <Input
                id="passport_savings"
                type="number"
                step="0.01"
                {...register("passport_savings")}
                className="mt-1"
                aria-invalid={!!errors.passport_savings}
              />
              <FieldErrorMessage message={errors.passport_savings?.message} />
            </div>
          </div>

          {/* Passport selector */}
          {passports.length > 0 && (
            <div>
              <Label>Passport Used</Label>
              <Select
                value={watch("passport_id") || ""}
                onValueChange={(v) => setValue("passport_id", v === "none" ? undefined : v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select passport..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {passports.filter(p => p.is_active).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.total_uses - p.uses_count} uses left)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ticket_cost">Ticket Cost</Label>
              <Input
                id="ticket_cost"
                type="number"
                step="0.01"
                {...register("ticket_cost")}
                className="mt-1"
                aria-invalid={!!errors.ticket_cost}
              />
              <FieldErrorMessage message={errors.ticket_cost?.message} />
            </div>
            <div>
              <Label htmlFor="convenience_fee">Booking Fee</Label>
              <Input
                id="convenience_fee"
                type="number"
                step="0.01"
                {...register("convenience_fee")}
                className="mt-1"
                aria-invalid={!!errors.convenience_fee}
              />
              <FieldErrorMessage message={errors.convenience_fee?.message} />
            </div>
          </div>

          {/* Gift Cards for Ticket */}
          <GiftCardSelector
            label="GC for Movie"
            usage={ticketGiftCards}
            allGiftCards={giftCards}
            availableGiftCards={availableTicketGiftCards}
            onAdd={(gcId) => addGiftCard(gcId, "ticket")}
            onRemove={(gcId) => removeGiftCard(gcId, "ticket")}
            onUpdateAmount={(gcId, amount) => updateGiftCardAmount(gcId, amount, "ticket")}
          />
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
              <Label htmlFor="mood_id">Mood</Label>
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
                aria-invalid={!!errors.fnb_cost}
              />
              <FieldErrorMessage message={errors.fnb_cost?.message} />
            </div>
            <div>
              <Label htmlFor="other_expenses">Other Expenses</Label>
              <Input
                id="other_expenses"
                type="number"
                step="0.01"
                {...register("other_expenses")}
                className="mt-1"
                aria-invalid={!!errors.other_expenses}
              />
              <FieldErrorMessage message={errors.other_expenses?.message} />
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

          {/* Gift Cards for F&B */}
          <GiftCardSelector
            label="GC for F&B"
            usage={fnbGiftCards}
            allGiftCards={giftCards}
            availableGiftCards={availableFnbGiftCards}
            onAdd={(gcId) => addGiftCard(gcId, "fnb")}
            onRemove={(gcId) => removeGiftCard(gcId, "fnb")}
            onUpdateAmount={(gcId, amount) => updateGiftCardAmount(gcId, amount, "fnb")}
          />

          {/* Payment Methods */}
          <div>
            <Label>Payment Methods</Label>
            {paymentMethods.length > 0 && (
              <div className="mt-2 space-y-2">
                {paymentMethods.map((pm, index) => (
                  <div key={index} className="flex items-center gap-2 rounded-md border p-2">
                    <Select
                      value={pm.method}
                      onValueChange={(value) => updatePaymentMethod(index, "method", value)}
                    >
                      <SelectTrigger className="h-8 w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((method) => (
                          <SelectItem key={method} value={method}>
                            {method}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1 flex-1">
                      <span className="text-xs text-muted-foreground">₹</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={pm.amount}
                        onChange={(e) => updatePaymentMethod(index, "amount", parseFloat(e.target.value) || 0)}
                        className="h-8"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removePaymentMethod(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={addPaymentMethod}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add Payment
            </Button>
          </div>

          {/* Franchise */}
          {franchises.length > 0 && (
            <div>
              <Label>Franchise</Label>
              <Select
                value={watch("franchise_id") || ""}
                onValueChange={(v) => setValue("franchise_id", v === "none" ? undefined : v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {franchises.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Rewatch Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm font-medium">This is a rewatch</Label>
              <p className="text-xs text-muted-foreground">Link to original viewing</p>
            </div>
            <Switch checked={isRewatch} onCheckedChange={setIsRewatch} />
          </div>

          {/* Original Movie Selector (when rewatch) */}
          {isRewatch && allMovies.length > 0 && (
            <div>
              <Label>Original Viewing</Label>
              <Select
                value={watch("original_movie_id") || ""}
                onValueChange={(v) => setValue("original_movie_id", v === "none" ? undefined : v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select original movie..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {allMovies
                    .filter((m) => !m.is_rewatch)
                    .sort((a, b) => b.title.localeCompare(a.title))
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.title} ({new Date(m.date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Companions */}
          {companions.length > 0 && (
            <div>
              <Label className="mb-2 block">Companions</Label>
              <div className="flex flex-wrap gap-2">
                {companions.map((c) => {
                  const selected = selectedCompanionIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setSelectedCompanionIds((prev) =>
                          selected
                            ? prev.filter((id) => id !== c.id)
                            : [...prev, c.id]
                        )
                      }
                      className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors ${
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      <span>{c.avatar_emoji}</span>
                      <span>{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Watched With (free text fallback) */}
          <div>
            <Label htmlFor="watched_with">Watched With</Label>
            <Input
              id="watched_with"
              {...register("watched_with")}
              placeholder="Solo, Friends, Family..."
              className="mt-1"
            />
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
