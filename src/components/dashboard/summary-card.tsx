"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formula";

interface SummaryCardProps {
  year: number;
  totalSpend: number;
  movieCount: number;
  averageRating: number;
}

export function SummaryCard({
  year,
  totalSpend,
  movieCount,
  averageRating,
}: SummaryCardProps) {
  // Calculate progress bar width based on average rating (1-10 scale)
  const ratingProgress = ((averageRating - 1) / 9) * 100;

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="mb-1 text-2xl font-bold text-primary">{year}</div>
        <div className="mb-3 text-sm text-muted-foreground">
          {formatCurrency(totalSpend)} spent &bull; {movieCount} movies
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${ratingProgress}%` }}
              />
            </div>
          </div>
          <span className="text-sm font-medium">
            {averageRating.toFixed(1)} avg
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
