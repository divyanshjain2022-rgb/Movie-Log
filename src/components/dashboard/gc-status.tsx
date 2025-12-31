"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/formula";
import { cn } from "@/lib/utils";
import type { GiftCardWithUsage } from "@/types";

interface GCStatusProps {
  giftCards: GiftCardWithUsage[];
}

export function GCStatus({ giftCards }: GCStatusProps) {
  const activeCards = giftCards.filter((gc) => gc.status === "active");

  if (activeCards.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">No active gift cards</p>
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {activeCards.map((gc) => {
        const daysUntilExpiry = Math.ceil(
          (new Date(gc.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        const isExpiringSoon = daysUntilExpiry <= 30;

        return (
          <Link
            key={gc.id}
            href={`/gift-cards`}
            className="min-w-[140px] flex-shrink-0"
          >
            <Card
              className={cn(
                "h-full transition-colors hover:bg-secondary/50",
                isExpiringSoon && "border-negative/50"
              )}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {gc.platform?.name || "Gift Card"}
                  </span>
                  {isExpiringSoon && (
                    <Badge variant="destructive" className="h-4 text-[10px]">
                      Expiring
                    </Badge>
                  )}
                </div>
                <div className="mt-1 text-lg font-bold text-positive">
                  {formatCurrency(gc.balance)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Expires {formatDate(gc.expiry_date)}
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
