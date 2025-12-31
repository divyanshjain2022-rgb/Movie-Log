"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calendar, Film } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { TicketUpload, MovieForm, TMDBSearch } from "@/components/movies";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useLookupData, useGiftCards, useCreateMovie } from "@/hooks";
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

export default function NewMoviePage() {
  const router = useRouter();
  const { formats, theaters, moods, aspects, rewatchOptions, isLoading: lookupLoading } = useLookupData();
  const { giftCards, isLoading: giftCardsLoading } = useGiftCards();
  const { createMovie, isLoading: isSubmitting } = useCreateMovie();

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
        throw new Error("OCR request failed");
      }

      const data: TicketOCRData = await response.json();
      setOcrRawData(data); // Store raw data for theater/format matching

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
      toast.success("Ticket data extracted!");
    } catch (error) {
      toast.error("Failed to extract ticket data. Try entering manually.");
      console.error(error);
      setShowForm(true);
    } finally {
      setIsUploading(false);
    }
  };

  const handleTMDBSelect = (movie: TMDBMovieDetails) => {
    setTmdbData(movie);
    // Only update TMDB-specific fields, don't duplicate title
    setExtractedData((prev) => ({
      ...prev,
      title: movie.title, // Replace title with TMDB title (properly formatted)
      tmdb_id: movie.tmdb_id,
      runtime_minutes: movie.runtime_minutes,
      genres: movie.genres,
      language: movie.language,
      director: movie.director,
      poster_url: movie.poster_url,
    }));
    toast.success("Movie details loaded from TMDB!");
  };

  const handleSubmit = async (data: MovieFormData, giftCardUsage?: GiftCardUsageEntry[]) => {
    try {
      await createMovie({
        user_id: "",
        title: data.title,
        date: data.date,
        showtime: data.showtime || null,
        theater_id: data.theater_id || null,
        audi: data.audi || null,
        format_id: data.format_id || null,
        seat: data.seat || null,
        ticket_cost: data.ticket_cost,
        convenience_fee: data.convenience_fee,
        booking_id: data.booking_id || null,
        tmdb_id: tmdbData?.tmdb_id || data.tmdb_id || null,
        runtime_minutes: tmdbData?.runtime_minutes || data.runtime_minutes || null,
        genres: tmdbData?.genres || data.genres || null,
        language: tmdbData?.language || data.language || null,
        director: tmdbData?.director || data.director || null,
        poster_url: tmdbData?.poster_url || data.poster_url || null,
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
      }, giftCardUsage);

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
