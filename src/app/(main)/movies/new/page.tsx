"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared";
import { TicketUpload, MovieForm, TMDBSearch } from "@/components/movies";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useLookupData, useGiftCards, useCreateMovie } from "@/hooks";
import type { MovieFormData, TicketOCRData } from "@/types";

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

export default function NewMoviePage() {
  const router = useRouter();
  const { formats, theaters, moods, aspects, rewatchOptions, isLoading: lookupLoading } = useLookupData();
  const { giftCards, isLoading: giftCardsLoading } = useGiftCards();
  const { createMovie, isLoading: isSubmitting } = useCreateMovie();

  const [isUploading, setIsUploading] = useState(false);
  const [extractedData, setExtractedData] = useState<Partial<MovieFormData>>({});
  const [showForm, setShowForm] = useState(false);
  const [tmdbData, setTmdbData] = useState<TMDBMovieDetails | null>(null);

  const handleTicketUpload = async (file: File) => {
    setIsUploading(true);
    try {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]); // Remove data:image/...;base64, prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Call OCR API
      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType: file.type }),
      });

      if (!response.ok) {
        throw new Error("OCR request failed");
      }

      const data: TicketOCRData = await response.json();

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
      setShowForm(true); // Show form anyway so user can enter manually
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
    }));
    toast.success("Movie details loaded from TMDB!");
  };

  const handleSubmit = async (data: MovieFormData) => {
    try {
      // Get user_id from session (this will be handled by RLS in production)
      await createMovie({
        user_id: "", // Will be set by Supabase RLS
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
        rating: data.rating || null,
        mood_id: data.mood_id || null,
        fnb_cost: data.fnb_cost || null,
        fnb_items: data.fnb_items || null,
        strongest_part_id: data.strongest_part_id || null,
        weakest_part_id: data.weakest_part_id || null,
        rewatch_id: data.rewatch_id || null,
        review: data.review || null,
        remarks: data.remarks || null,
        gc_id: data.gc_id === "none" ? null : data.gc_id || null,
        other_expenses: data.other_expenses || null,
        passport_savings: data.passport_savings || 0,
      });

      toast.success("Movie logged successfully!");
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
        <div className="p-4">
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
              />
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
