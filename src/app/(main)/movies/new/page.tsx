"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calendar, Film } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { TicketUpload, MovieForm, TMDBSearch } from "@/components/movies";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useLookupData, useGiftCards, useCreateMovie, useMovies, useFranchises, useCompanions, useSyncMovieCompanions } from "@/hooks";
import { cn } from "@/lib/utils";
import type { MovieFormData, TicketOCRData, GiftCardUsageEntry } from "@/types";

interface TMDBMovieDetails {
  tmdb_id: number;
  title: string;
  runtime_minutes?: number;
  genres?: string[];
  language?: string;
  director?: string;
  poster_url?: string;
  release_date?: string;
  overview?: string;
  // Enriched fields
  cast_members?: string[];
  composer?: string;
  cinematographer?: string;
  budget?: number;
  box_office?: number;
  tmdb_rating?: number;
  tmdb_vote_count?: number;
  certification?: string;
  trailer_url?: string;
  keywords?: string[];
}

type BookingMode = "watched" | "advance";

// Fuzzy match helper - finds best matching item by name
function fuzzyMatch<T extends { id: string; name: string }>(
  items: T[],
  searchText: string | null
): string | undefined {
  if (!searchText || !items.length) return undefined;

  const search = searchText.toLowerCase();

  // Try exact match first
  const exact = items.find(item => item.name.toLowerCase() === search);
  if (exact) return exact.id;

  // Try contains match
  const contains = items.find(item =>
    item.name.toLowerCase().includes(search) ||
    search.includes(item.name.toLowerCase())
  );
  if (contains) return contains.id;

  // Try partial word match
  const searchWords = search.split(/\s+/);
  const partial = items.find(item => {
    const itemWords = item.name.toLowerCase().split(/\s+/);
    return searchWords.some(sw => itemWords.some(iw => iw.includes(sw) || sw.includes(iw)));
  });

  return partial?.id;
}

// Convert 12-hour time (e.g., "06:45 PM") to 24-hour format (e.g., "18:45")
function convertTo24Hour(time12h: string | null | undefined): string | null {
  if (!time12h) return null;

  // If already in 24-hour format (no AM/PM), return as-is
  if (!/[ap]m/i.test(time12h)) {
    // Validate it's a proper time format
    const match = time12h.match(/^(\d{1,2}):(\d{2})/);
    return match ? `${match[1].padStart(2, '0')}:${match[2]}` : time12h;
  }

  const match = time12h.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!match) return time12h;

  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3].toLowerCase();

  if (period === 'pm' && hours !== 12) {
    hours += 12;
  } else if (period === 'am' && hours === 12) {
    hours = 0;
  }

  return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

export default function NewMoviePage() {
  const router = useRouter();
  const { formats, theaters, moods, aspects, rewatchOptions, isLoading: lookupLoading } = useLookupData();
  const { giftCards, isLoading: giftCardsLoading } = useGiftCards();
  const { createMovie, isLoading: isSubmitting } = useCreateMovie();
  const { movies: allMovies } = useMovies();
  const { franchises } = useFranchises();
  const { companions } = useCompanions();
  const { syncCompanions } = useSyncMovieCompanions();

  const [mode, setMode] = useState<BookingMode>("watched");
  const [isUploading, setIsUploading] = useState(false);
  const [extractedData, setExtractedData] = useState<Partial<MovieFormData>>({});
  const [showForm, setShowForm] = useState(false);
  const [tmdbData, setTmdbData] = useState<TMDBMovieDetails | null>(null);
  const [ocrRawData, setOcrRawData] = useState<TicketOCRData | null>(null);

  // Match theater and format once lookup data is loaded
  useEffect(() => {
    if (ocrRawData && !lookupLoading) {
      const matchedTheaterId = fuzzyMatch(theaters, ocrRawData.theater);
      const matchedFormatId = fuzzyMatch(formats, ocrRawData.format);

      if (matchedTheaterId || matchedFormatId) {
        setExtractedData(prev => ({
          ...prev,
          ...(matchedTheaterId && { theater_id: matchedTheaterId }),
          ...(matchedFormatId && { format_id: matchedFormatId }),
        }));
      }
    }
  }, [ocrRawData, theaters, formats, lookupLoading]);

  const handleTicketUpload = async (file: File) => {
    setIsUploading(true);
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

      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType: file.type }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `OCR request failed (${response.status})`);
      }

      const data: TicketOCRData = await response.json();
      console.log("[OCR] Full API response:", JSON.stringify(data, null, 2));
      setOcrRawData(data); // Store raw data for theater/format matching

      // Show debug info for missing fields
      const missing: string[] = [];
      if (!data.movie_title) missing.push("title");
      if (!data.date) missing.push("date");
      if (!data.showtime) missing.push("showtime");
      if (!data.theater) missing.push("theater");
      if (!data.audi) missing.push("audi");
      if (!data.format) missing.push("format");
      if (!data.ticket_cost) missing.push("ticket_cost");
      if (!data.booking_id) missing.push("booking_id");

      setExtractedData({
        title: data.movie_title || "",
        date: data.date || new Date().toISOString().split("T")[0],
        showtime: data.showtime || "",
        audi: data.audi || "",
        seat: data.seat || "",
        ticket_cost: data.ticket_cost || 0,
        convenience_fee: data.convenience_fee || 0,
        booking_id: data.booking_id || "",
      });

      setShowForm(true);

      if (missing.length > 0) {
        toast.warning(`Extracted but missing: ${missing.join(", ")}`, { duration: 8000 });
      } else {
        toast.success("All ticket data extracted!");
      }

      // Debug toast with raw values
      toast.info(
        `OCR Debug: title="${data.movie_title}" | showtime="${data.showtime}" | date="${data.date}" | theater="${data.theater}" | audi="${data.audi}" | format="${data.format}" | cost=${data.ticket_cost} | fee=${data.convenience_fee} | booking="${data.booking_id}"`,
        { duration: 15000 }
      );
    } catch (error: any) {
      const msg = error?.message || "Unknown error";
      toast.error(msg.includes("Missing API Key")
        ? "Google API key not configured. Enter data manually."
        : `OCR failed: ${msg}`);
      console.error("[OCR]", error);
      setShowForm(true);
    } finally {
      setIsUploading(false);
    }
  };

  const handleTMDBSelect = (movie: TMDBMovieDetails) => {
    setTmdbData(movie);
    setExtractedData((prev) => ({
      ...prev,
      title: movie.title,
      tmdb_id: movie.tmdb_id,
      runtime_minutes: movie.runtime_minutes,
      genres: movie.genres,
      language: movie.language,
      director: movie.director,
      poster_url: movie.poster_url,
      // Enriched TMDB fields
      cast_members: movie.cast_members,
      composer: movie.composer,
      cinematographer: movie.cinematographer,
      budget: movie.budget || undefined,
      box_office: movie.box_office || undefined,
      tmdb_rating: movie.tmdb_rating || undefined,
      tmdb_vote_count: movie.tmdb_vote_count || undefined,
      certification: movie.certification || undefined,
      trailer_url: movie.trailer_url || undefined,
      keywords: movie.keywords,
      overview: movie.overview || undefined,
      release_date: movie.release_date || undefined,
    }));
    toast.success("Movie details loaded from TMDB!");
  };

  const handleSubmit = async (data: MovieFormData, giftCardUsage?: GiftCardUsageEntry[]) => {
    try {
      const movie = await createMovie({
        user_id: "",
        title: data.title,
        date: data.date,
        showtime: convertTo24Hour(data.showtime),
        theater_id: data.theater_id || null,
        audi: data.audi || null,
        format_id: data.format_id || null,
        seat: data.seat || null,
        ticket_cost: data.ticket_cost,
        convenience_fee: data.convenience_fee,
        booking_id: data.booking_id || null,
        tmdb_id: data.tmdb_id || null,
        runtime_minutes: data.runtime_minutes || null,
        genres: data.genres || null,
        language: data.language || null,
        director: data.director || null,
        poster_url: data.poster_url || null,
        rating: mode === "advance" ? null : data.rating || null,
        mood_id: mode === "advance" ? null : data.mood_id || null,
        fnb_cost: data.fnb_cost || null,
        fnb_items: data.fnb_items || null,
        strongest_part_id: mode === "advance" ? null : data.strongest_part_id || null,
        weakest_part_id: mode === "advance" ? null : data.weakest_part_id || null,
        rewatch_id: mode === "advance" ? null : data.rewatch_id || null,
        review: mode === "advance" ? null : data.review || null,
        remarks: data.remarks || null,
        other_expenses: data.other_expenses || null,
        passport_savings: data.passport_savings || 0,
        status: mode === "advance" ? "upcoming" : "watched",
        watched_with: data.watched_with || null,
        payment_methods: data.payment_methods || [],
        cast_members: data.cast_members || null,
        composer: data.composer || null,
        cinematographer: data.cinematographer || null,
        budget: data.budget || null,
        box_office: data.box_office || null,
        tmdb_rating: data.tmdb_rating || null,
        tmdb_vote_count: data.tmdb_vote_count || null,
        certification: data.certification || null,
        trailer_url: data.trailer_url || null,
        keywords: data.keywords || null,
        overview: data.overview || null,
        release_date: data.release_date || null,
        franchise_id: data.franchise_id || null,
        is_rewatch: data.is_rewatch || false,
        original_movie_id: data.original_movie_id || null,
      } as any, giftCardUsage);

      // Sync companion associations
      const movieId = (movie as any)?.id;
      if (data.companion_ids?.length && movieId) {
        await syncCompanions(movieId, data.companion_ids);
      }

      toast.success(mode === "advance" ? "Advance booking saved!" : "Movie logged successfully!");
      router.push("/movies");
    } catch (error) {
      toast.error("Failed to save movie");
      console.error(error);
    }
  };

  const handleSkipOCR = () => {
    setShowForm(true);
  };

  const isLoading = lookupLoading || giftCardsLoading;

  return (
    <div className="flex min-h-screen flex-col pb-20">
      <PageHeader title="Add Movie" showBack />

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Mode Toggle */}
          <div className="flex rounded-xl bg-secondary/50 p-1">
            <button
              onClick={() => setMode("watched")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all",
                mode === "watched"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Film className="h-4 w-4" />
              Watched Movie
            </button>
            <button
              onClick={() => setMode("advance")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all",
                mode === "advance"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Calendar className="h-4 w-4" />
              Advance Booking
            </button>
          </div>

          {mode === "advance" && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
              Advance booking mode: Only ticket details required. Add your rating and review after watching!
            </div>
          )}

          {!showForm ? (
            <div className="space-y-6">
              <TicketUpload onUpload={handleTicketUpload} isLoading={isUploading} />
              <div className="text-center">
                <button
                  onClick={handleSkipOCR}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Or enter details manually
                </button>
              </div>
            </div>
          ) : isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* TMDB Search */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Search Movie</label>
                <TMDBSearch
                  initialTitle={extractedData.title || ""}
                  onSelect={handleTMDBSelect}
                  selectedTmdbId={tmdbData?.tmdb_id}
                />
                <p className="text-xs text-muted-foreground">
                  Search to auto-fill movie details and poster
                </p>
              </div>

              {/* Movie Form */}
              <MovieForm
                initialData={extractedData}
                formats={formats}
                theaters={theaters}
                moods={moods}
                aspects={aspects}
                rewatchOptions={rewatchOptions}
                giftCards={giftCards.filter((gc) => gc.status === "active")}
                franchises={franchises}
                companions={companions}
                allMovies={allMovies}
                onSubmit={handleSubmit}
                isLoading={isSubmitting}
                isAdvanceBooking={mode === "advance"}
              />
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
