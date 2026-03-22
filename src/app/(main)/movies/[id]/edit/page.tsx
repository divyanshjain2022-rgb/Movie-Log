"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared";
import { MovieForm } from "@/components/movies";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useMovie, useMovies, useLookupData, useGiftCards, useUpdateMovie, useFranchises, useCompanions, useMovieCompanions, useSyncMovieCompanions, usePassports } from "@/hooks";
import type { MovieFormData, GiftCardUsageEntry } from "@/types";

interface EditMoviePageProps {
  params: Promise<{ id: string }>;
}

export default function EditMoviePage({ params }: EditMoviePageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { movie, isLoading: movieLoading } = useMovie(id);
  const { formats, theaters, moods, aspects, rewatchOptions, isLoading: lookupLoading } = useLookupData();
  const { giftCards, isLoading: giftCardsLoading } = useGiftCards();
  const { updateMovie, isLoading: isSubmitting } = useUpdateMovie();
  const { movies: allMovies } = useMovies();
  const { franchises } = useFranchises();
  const { companions } = useCompanions();
  const { passports } = usePassports();
  const { companionIds: initialCompanionIds } = useMovieCompanions(id);
  const { syncCompanions } = useSyncMovieCompanions();

  const handleSubmit = async (data: MovieFormData, giftCardUsage?: GiftCardUsageEntry[]) => {
    // Convert 12-hour time to 24-hour format
    const convertTo24Hour = (time12h: string | null | undefined): string | null => {
      if (!time12h) return null;
      if (!/[ap]m/i.test(time12h)) {
        const match = time12h.match(/^(\d{1,2}):(\d{2})/);
        return match ? `${match[1].padStart(2, '0')}:${match[2]}` : time12h;
      }
      const match = time12h.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
      if (!match) return time12h;
      let hours = parseInt(match[1], 10);
      const minutes = match[2];
      const period = match[3].toLowerCase();
      if (period === 'pm' && hours !== 12) hours += 12;
      else if (period === 'am' && hours === 12) hours = 0;
      return `${hours.toString().padStart(2, '0')}:${minutes}`;
    };

    try {
      await updateMovie(id, {
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
        rating: data.rating || null,
        mood_id: data.mood_id || null,
        fnb_cost: data.fnb_cost || null,
        fnb_items: data.fnb_items || null,
        strongest_part_id: data.strongest_part_id || null,
        weakest_part_id: data.weakest_part_id || null,
        rewatch_id: data.rewatch_id || null,
        review: data.review || null,
        remarks: data.remarks || null,
        other_expenses: data.other_expenses || null,
        passport_savings: data.passport_savings || 0,
        // New fields
        watched_with: data.watched_with || null,
        payment_methods: data.payment_methods || [],
        // TMDB enrichment
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
        passport_id: data.passport_id || null,
      }, giftCardUsage || []);

      // Sync companion associations
      if (data.companion_ids) {
        await syncCompanions(id, data.companion_ids);
      }

      toast.success("Movie updated successfully!");
      router.push(`/movies/${id}`);
    } catch (error) {
      toast.error("Failed to update movie");
      console.error(error);
    }
  };

  const isLoading = movieLoading || lookupLoading || giftCardsLoading;

  // Convert movie data to form data format
  const initialData: Partial<MovieFormData> = movie
    ? {
      title: movie.title,
      date: movie.date,
      showtime: movie.showtime || undefined,
      theater_id: movie.theater_id || undefined,
      audi: movie.audi || undefined,
      format_id: movie.format_id || undefined,
      seat: movie.seat || undefined,
      ticket_cost: movie.ticket_cost,
      convenience_fee: movie.convenience_fee,
      booking_id: movie.booking_id || undefined,
      tmdb_id: movie.tmdb_id || undefined,
      runtime_minutes: movie.runtime_minutes || undefined,
      genres: movie.genres || undefined,
      language: movie.language || undefined,
      director: movie.director || undefined,
      poster_url: movie.poster_url || undefined,
      rating: movie.rating || undefined,
      mood_id: movie.mood_id || undefined,
      fnb_cost: movie.fnb_cost || undefined,
      fnb_items: movie.fnb_items || undefined,
      strongest_part_id: movie.strongest_part_id || undefined,
      weakest_part_id: movie.weakest_part_id || undefined,
      rewatch_id: movie.rewatch_id || undefined,
      review: movie.review || undefined,
      remarks: movie.remarks || undefined,
      other_expenses: movie.other_expenses || undefined,
      passport_savings: movie.passport_savings || undefined,
      // New fields
      watched_with: movie.watched_with || undefined,
      payment_methods: (movie.payment_methods as Array<{method: string; amount: number}>) || undefined,
      // TMDB enrichment
      cast_members: movie.cast_members || undefined,
      composer: movie.composer || undefined,
      cinematographer: movie.cinematographer || undefined,
      budget: movie.budget || undefined,
      box_office: movie.box_office || undefined,
      tmdb_rating: movie.tmdb_rating || undefined,
      tmdb_vote_count: movie.tmdb_vote_count || undefined,
      certification: movie.certification || undefined,
      trailer_url: movie.trailer_url || undefined,
      keywords: movie.keywords || undefined,
      overview: movie.overview || undefined,
      release_date: movie.release_date || undefined,
      franchise_id: movie.franchise_id || undefined,
      is_rewatch: movie.is_rewatch || false,
      original_movie_id: movie.original_movie_id || undefined,
      passport_id: (movie as any).passport_id || undefined,
    }
    : {};

  // Pre-populate gift card usage from junction table
  const initialGiftCardUsage = movie?.movie_gift_cards?.map(mgc => ({
    gift_card_id: mgc.gift_card?.id || "",
    amount_used: mgc.amount_used,
    purpose: (mgc as any).purpose || "ticket" as "ticket" | "fnb",
  })).filter(u => u.gift_card_id) || [];

  // When editing, add back this movie's GC usage to each card's balance
  // so the user can adjust amounts without being capped at 0
  const adjustedGiftCards = giftCards.map(gc => {
    const movieUsage = initialGiftCardUsage
      .filter(u => u.gift_card_id === gc.id)
      .reduce((sum, u) => sum + u.amount_used, 0);
    if (movieUsage > 0) {
      return { ...gc, balance: gc.balance + movieUsage, status: "active" as const };
    }
    return gc;
  });

  return (
    <div className="flex min-h-screen flex-col">
      <PageHeader title="Edit Movie" showBack />

      <ScrollArea className="flex-1">
        <div className="p-4">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !movie ? (
            <div className="flex min-h-[50vh] items-center justify-center">
              <p className="text-muted-foreground">Movie not found</p>
            </div>
          ) : (
            <MovieForm
              initialData={initialData}
              formats={formats}
              theaters={theaters}
              moods={moods}
              aspects={aspects}
              rewatchOptions={rewatchOptions}
              giftCards={adjustedGiftCards.filter((gc) => gc.status === "active" || initialGiftCardUsage.some(u => u.gift_card_id === gc.id))}
              franchises={franchises}
              companions={companions}
              passports={passports}
              allMovies={allMovies}
              initialCompanionIds={initialCompanionIds}
              onSubmit={handleSubmit}
              isLoading={isSubmitting}
              isEditing
              initialGiftCardUsage={initialGiftCardUsage}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
