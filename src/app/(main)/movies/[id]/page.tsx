"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit, Trash2, ExternalLink, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/shared";
import { PhotoGallery } from "@/components/movies/photo-gallery";
import { ShareableCard } from "@/components/movies/shareable-card";
import { TheaterRatingForm } from "@/components/movies/theater-rating-form";
import { useMovie, useDeleteMovie, useMovies } from "@/hooks";
import {
  formatCurrency,
  formatDate,
  formatTime,
  getRatingColor,
  getRatingLabel,
} from "@/lib/formula";
import { cn } from "@/lib/utils";

interface MovieDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function MovieDetailPage({ params }: MovieDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { movie, isLoading, error } = useMovie(id);
  const { movies: allMovies } = useMovies();
  const { deleteMovie, isLoading: isDeleting } = useDeleteMovie();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteMovie(id);
      toast.success("Movie deleted");
      router.push("/movies");
    } catch (error) {
      toast.error("Failed to delete movie");
      console.error(error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="" showBack />
        <div className="space-y-4 p-4">
          <div className="flex gap-4">
            <Skeleton className="h-32 w-20" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (error || !movie) {
    return (
      <div className="min-h-screen">
        <PageHeader title="" showBack />
        <div className="flex min-h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">Movie not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        title=""
        showBack
        action={
          <div className="flex items-center gap-1">
            <ShareableCard movie={movie}>
              <Button variant="ghost" size="sm">
                <Share2 className="h-4 w-4" />
              </Button>
            </ShareableCard>
            <Link href={`/movies/${id}/edit`}>
              <Button variant="ghost" size="sm">
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </Link>
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this movie?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete &quot;{movie.title}&quot; from your log. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      />

      <div className="p-4">
        {/* Header with poster */}
        <div className="mb-6 flex gap-4">
          {movie.poster_url ? (
            <div className="h-36 w-24 flex-shrink-0 overflow-hidden rounded-lg">
              <img
                src={movie.poster_url}
                alt={movie.title}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="flex h-36 w-24 flex-shrink-0 items-center justify-center rounded-lg bg-secondary text-2xl">
              🎬
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-xl font-bold">{movie.title}</h1>
            {movie.certification && (
              <Badge variant="outline" className="mr-1 mt-1">
                {movie.certification}
              </Badge>
            )}
            {movie.genres && movie.genres.length > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                {movie.genres.join(", ")}
              </p>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              {movie.runtime_minutes && `${movie.runtime_minutes} min`}
              {movie.language && ` \u2022 ${movie.language}`}
            </p>
            {movie.director && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                Dir:{" "}
                <Link
                  href={`/crew/${encodeURIComponent(movie.director)}`}
                  className="text-primary hover:underline"
                >
                  {movie.director}
                </Link>
              </p>
            )}
            {movie.cast_members && movie.cast_members.length > 0 && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {movie.cast_members.map((actor, i) => (
                  <span key={actor}>
                    {i > 0 && ", "}
                    <Link
                      href={`/crew/${encodeURIComponent(actor)}`}
                      className="text-primary hover:underline"
                    >
                      {actor}
                    </Link>
                  </span>
                ))}
              </p>
            )}
            <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
              {movie.composer && (
                <span>
                  Music:{" "}
                  <Link
                    href={`/crew/${encodeURIComponent(movie.composer)}`}
                    className="text-primary hover:underline"
                  >
                    {movie.composer}
                  </Link>
                </span>
              )}
              {movie.composer && movie.cinematographer && <span> \u2022 </span>}
              {movie.cinematographer && (
                <span>
                  DOP:{" "}
                  <Link
                    href={`/crew/${encodeURIComponent(movie.cinematographer)}`}
                    className="text-primary hover:underline"
                  >
                    {movie.cinematographer}
                  </Link>
                </span>
              )}
            </div>
            {movie.trailer_url && (
              <a
                href={movie.trailer_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Watch Trailer <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        {/* Budget & Box Office */}
        {(movie.budget || movie.box_office) && (
          <div className="mb-4 flex gap-3">
            {movie.budget && movie.budget > 0 && (
              <div className="flex-1 rounded-lg bg-card p-3 text-center">
                <p className="text-xs text-muted-foreground">Budget</p>
                <p className="text-sm font-semibold">${(movie.budget / 1_000_000).toFixed(0)}M</p>
              </div>
            )}
            {movie.box_office && movie.box_office > 0 && (
              <div className="flex-1 rounded-lg bg-card p-3 text-center">
                <p className="text-xs text-muted-foreground">Box Office</p>
                <p className="text-sm font-semibold">${(movie.box_office / 1_000_000).toFixed(0)}M</p>
              </div>
            )}
            {movie.budget && movie.budget > 0 && movie.box_office && movie.box_office > 0 && (
              <div className="flex-1 rounded-lg bg-card p-3 text-center">
                <p className="text-xs text-muted-foreground">ROI</p>
                <p className={cn(
                  "text-sm font-semibold",
                  movie.box_office > movie.budget ? "text-positive" : "text-negative"
                )}>
                  {((movie.box_office / movie.budget - 1) * 100).toFixed(0)}%
                </p>
              </div>
            )}
          </div>
        )}

        {/* Rating Section */}
        {movie.rating && (
          <div className="mb-6 rounded-lg bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={cn("text-3xl font-bold", getRatingColor(movie.rating))}
                >
                  {movie.rating.toFixed(1)}
                </span>
                <div>
                  <p className="font-medium">{getRatingLabel(movie.rating)}</p>
                  {movie.mood && (
                    <p className="text-sm text-muted-foreground">
                      {movie.mood.emoji && `${movie.mood.emoji} `}
                      {movie.mood.name}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right space-y-1">
                {movie.tmdb_rating && (
                  <div>
                    <p className="text-xs text-muted-foreground">TMDB</p>
                    <p className="text-sm font-medium">
                      {movie.tmdb_rating.toFixed(1)}/10
                      {movie.rating && (
                        <span className={cn(
                          "ml-1 text-xs",
                          movie.rating > movie.tmdb_rating ? "text-positive" : movie.rating < movie.tmdb_rating ? "text-negative" : "text-muted-foreground"
                        )}>
                          ({movie.rating > movie.tmdb_rating ? "+" : ""}{(movie.rating - movie.tmdb_rating).toFixed(1)})
                        </span>
                      )}
                    </p>
                  </div>
                )}
                {movie.value_score && (
                  <div>
                    <p className="text-xs text-muted-foreground">Value Score</p>
                    <p className="text-sm font-bold">{movie.value_score.toFixed(1)}</p>
                  </div>
                )}
              </div>
            </div>
            {movie.review && (
              <p className="mt-3 text-sm italic text-muted-foreground">
                &quot;{movie.review}&quot;
              </p>
            )}
          </div>
        )}

        {/* Details Section */}
        <section className="mb-6">
          <h2 className="mb-3 font-semibold">Details</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span>
                {formatDate(movie.date)}
                {movie.date && (
                  <span className="ml-1 text-muted-foreground">
                    ({new Date(movie.date).toLocaleDateString("en-IN", { weekday: "long" })})
                  </span>
                )}
              </span>
            </div>
            {movie.showtime && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Showtime</span>
                <span>{formatTime(movie.showtime)}</span>
              </div>
            )}
            {movie.theater && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Theater</span>
                <div className="flex items-center gap-2">
                  <span>{movie.theater.name}</span>
                  <TheaterRatingForm
                    theaterId={movie.theater.id}
                    audi={movie.audi || undefined}
                    movieId={movie.id}
                  >
                    <button className="text-xs text-primary hover:underline">
                      Rate
                    </button>
                  </TheaterRatingForm>
                </div>
              </div>
            )}
            {movie.format && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Format</span>
                <Badge variant="secondary">{movie.format.name}</Badge>
              </div>
            )}
            {movie.audi && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Audi</span>
                <span>{movie.audi}</span>
              </div>
            )}
            {movie.seat && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Seat</span>
                <span>{movie.seat}</span>
              </div>
            )}
            {movie.booking_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Booking ID</span>
                <span className="font-mono text-xs">{movie.booking_id}</span>
              </div>
            )}
            {movie.watched_with && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Watched With</span>
                <span>{movie.watched_with}</span>
              </div>
            )}
            {movie.release_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Days After Release</span>
                <span>
                  {Math.max(0, Math.floor((new Date(movie.date).getTime() - new Date(movie.release_date).getTime()) / (1000 * 60 * 60 * 24)))} days
                </span>
              </div>
            )}
          </div>
        </section>

        <Separator className="my-4" />

        {/* Spending Section */}
        <section className="mb-6">
          <h2 className="mb-3 font-semibold">Spending</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ticket</span>
              <span>{formatCurrency(movie.ticket_cost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Booking Fee</span>
              <span>{formatCurrency(movie.convenience_fee)}</span>
            </div>
            {movie.passport_savings > 0 && (
              <div className="flex justify-between text-positive">
                <span>Passport Savings</span>
                <span>-{formatCurrency(movie.passport_savings)}</span>
              </div>
            )}
            {movie.fnb_cost && movie.fnb_cost > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  F&B {movie.fnb_items && `(${movie.fnb_items})`}
                </span>
                <span>{formatCurrency(movie.fnb_cost)}</span>
              </div>
            )}
            {movie.other_expenses && movie.other_expenses > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Other Expenses</span>
                <span>{formatCurrency(movie.other_expenses)}</span>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between font-medium">
              <span>Total</span>
              <span>{formatCurrency(movie.total_cost)}</span>
            </div>

            {/* Multi-GC display */}
            {movie.movie_gift_cards && movie.movie_gift_cards.length > 0 && (
              <>
                <Separator className="my-2" />
                <p className="text-xs font-medium text-muted-foreground">Gift Cards Used</p>
                {movie.movie_gift_cards.map((mgc) => (
                  <div key={mgc.id} className="flex justify-between text-positive">
                    <span>
                      {mgc.gift_card?.platform_id ? "GC" : "Gift Card"} ({mgc.gift_card?.discount_percent?.toFixed(0)}% off)
                    </span>
                    <span>{formatCurrency(mgc.amount_used)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-medium text-positive">
                  <span>Effective Cost</span>
                  <span>
                    {formatCurrency(
                      movie.total_cost -
                      movie.movie_gift_cards.reduce((sum, mgc) => {
                        const discount = mgc.gift_card?.discount_percent || 0;
                        return sum + mgc.amount_used * (discount / 100);
                      }, 0)
                    )}
                  </span>
                </div>
              </>
            )}

            {/* Payment methods */}
            {movie.payment_methods && (movie.payment_methods as Array<{method: string; amount: number}>).length > 0 && (
              <>
                <Separator className="my-2" />
                <p className="text-xs font-medium text-muted-foreground">Payment Breakdown</p>
                {(movie.payment_methods as Array<{method: string; amount: number}>).map((pm, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-muted-foreground">{pm.method}</span>
                    <span>{formatCurrency(pm.amount)}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </section>

        <Separator className="my-4" />

        {/* Analysis Section */}
        <section className="mb-6">
          <h2 className="mb-3 font-semibold">Analysis</h2>
          <div className="space-y-2 text-sm">
            {movie.strongest_part && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Strongest</span>
                <Badge variant="outline" className="text-positive border-positive/50">
                  {movie.strongest_part.name}
                </Badge>
              </div>
            )}
            {movie.weakest_part && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Weakest</span>
                <Badge variant="outline" className="text-negative border-negative/50">
                  {movie.weakest_part.name}
                </Badge>
              </div>
            )}
            {movie.rewatch && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rewatch</span>
                <span>{movie.rewatch.name}</span>
              </div>
            )}
          </div>
        </section>

        {/* Keywords */}
        {movie.keywords && movie.keywords.length > 0 && (
          <>
            <Separator className="my-4" />
            <section className="mb-6">
              <h2 className="mb-3 font-semibold">Keywords</h2>
              <div className="flex flex-wrap gap-1">
                {movie.keywords.map((kw, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {kw}
                  </Badge>
                ))}
              </div>
            </section>
          </>
        )}

        {/* Overview */}
        {movie.overview && (
          <>
            <Separator className="my-4" />
            <section className="mb-6">
              <h2 className="mb-3 font-semibold">Synopsis</h2>
              <p className="text-sm text-muted-foreground">{movie.overview}</p>
            </section>
          </>
        )}

        {/* Photo Gallery */}
        <Separator className="my-4" />
        <section className="mb-6">
          <PhotoGallery movieId={movie.id} />
        </section>

        {/* Rewatch History */}
        {(() => {
          // Find rewatches of this movie, or if this is a rewatch, find the original + siblings
          const originalId = movie.is_rewatch ? movie.original_movie_id : movie.id;
          const rewatches = originalId
            ? allMovies.filter(
                (m) =>
                  (m.original_movie_id === originalId || m.id === originalId) &&
                  m.id !== movie.id
              )
            : [];

          if (rewatches.length === 0) return null;

          return (
            <>
              <Separator className="my-4" />
              <section className="mb-6">
                <h2 className="mb-3 font-semibold">
                  {movie.is_rewatch ? "Other Viewings" : "Rewatches"}
                </h2>
                <div className="space-y-2">
                  {rewatches
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .map((r) => (
                      <Link
                        key={r.id}
                        href={`/movies/${r.id}`}
                        className="flex items-center justify-between rounded-lg border p-3 hover:bg-secondary/50"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {formatDate(r.date)}
                            {r.is_rewatch && (
                              <Badge variant="secondary" className="ml-2 text-[10px]">
                                Rewatch
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {r.theater?.name}
                            {r.format?.name && ` \u2022 ${r.format.name}`}
                          </p>
                        </div>
                        {r.rating && (
                          <span className={cn("text-lg font-bold", getRatingColor(r.rating))}>
                            {r.rating.toFixed(1)}
                          </span>
                        )}
                      </Link>
                    ))}
                </div>
              </section>
            </>
          );
        })()}

        {/* Remarks Section */}
        {movie.remarks && (
          <>
            <Separator className="my-4" />
            <section className="mb-6">
              <h2 className="mb-3 font-semibold">Remarks</h2>
              <p className="text-sm text-muted-foreground">{movie.remarks}</p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
