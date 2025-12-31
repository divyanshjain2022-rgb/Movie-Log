"use client";

import { use } from "react";
import Link from "next/link";
import { Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared";
import { useMovie } from "@/hooks";
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
  const { movie, isLoading, error } = useMovie(id);

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
          <Link href={`/movies/${id}/edit`}>
            <Button variant="ghost" size="sm">
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </Link>
        }
      />

      <div className="p-4">
        {/* Header with poster */}
        <div className="mb-6 flex gap-4">
          {movie.poster_url ? (
            <div className="h-32 w-20 flex-shrink-0 overflow-hidden rounded-lg">
              <img
                src={movie.poster_url}
                alt={movie.title}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="flex h-32 w-20 flex-shrink-0 items-center justify-center rounded-lg bg-secondary text-2xl">
              🎬
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-xl font-bold">{movie.title}</h1>
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
                Dir: {movie.director}
              </p>
            )}
          </div>
        </div>

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
              {movie.value_score && (
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Value Score</p>
                  <p className="text-lg font-bold">{movie.value_score.toFixed(1)}</p>
                </div>
              )}
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
              <span>{formatDate(movie.date)}</span>
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
                <span>{movie.theater.name}</span>
              </div>
            )}
            {movie.format && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Format</span>
                <Badge variant="secondary">{movie.format.name}</Badge>
              </div>
            )}
            {movie.seat && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Seat</span>
                <span>{movie.seat}</span>
              </div>
            )}
            {movie.audi && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Audi</span>
                <span>{movie.audi}</span>
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
              <span className="text-muted-foreground">Conv. Fee</span>
              <span>{formatCurrency(movie.convenience_fee)}</span>
            </div>
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
                <span className="text-muted-foreground">Other</span>
                <span>{formatCurrency(movie.other_expenses)}</span>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between font-medium">
              <span>Total</span>
              <span>{formatCurrency(movie.total_cost)}</span>
            </div>
            {movie.gift_card && (
              <div className="flex justify-between text-positive">
                <span>True Cost (GC applied)</span>
                <span>
                  {formatCurrency(
                    movie.total_cost * (1 - movie.gift_card.discount_percent / 100)
                  )}
                </span>
              </div>
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
