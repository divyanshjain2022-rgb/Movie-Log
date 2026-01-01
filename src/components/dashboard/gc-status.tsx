"use client";

import Link from "next/link";
import { CreditCard, AlertTriangle, Plus, ChevronRight } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/formula";
import { cn } from "@/lib/utils";
import type { GiftCardWithUsage } from "@/types";

interface GCStatusProps {
  giftCards: GiftCardWithUsage[];
}

export function GCStatus({ giftCards }: GCStatusProps) {
  const activeCards = giftCards.filter((gc) => gc.status === "active");
  const totalBalance = activeCards.reduce((sum, gc) => sum + gc.balance, 0);

  if (activeCards.length === 0) {
    return (
      <Link href="/gift-cards">
        <div className="flex items-center justify-between rounded-xl border border-dashed border-border/50 bg-card/30 p-4 transition-colors hover:border-primary/30 hover:bg-card/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No gift cards</p>
              <p className="text-xs text-muted-foreground">Add your first gift card</p>
            </div>
          </div>
          <Plus className="h-5 w-5 text-muted-foreground" />
        </div>
      </Link>
    );
  }

  return (
    <div className="space-y-3">
      {/* Total balance header */}
      <Link href="/gift-cards">
        <div className="flex items-center justify-between rounded-xl border border-border/50 bg-gradient-to-r from-emerald-500/10 to-transparent p-4 transition-all hover:border-emerald-500/30">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20">
              <CreditCard className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Balance</p>
              <p className="text-xl font-bold text-emerald-400">{formatCurrency(totalBalance)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-sm">{activeCards.length} cards</span>
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      </Link>

      {/* Expiring soon alerts */}
      {activeCards.some((gc) => {
        const daysUntilExpiry = Math.ceil(
          (new Date(gc.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
      }) && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {activeCards
            .filter((gc) => {
              const daysUntilExpiry = Math.ceil(
                (new Date(gc.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
              );
              return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
            })
            .map((gc) => {
              const daysUntilExpiry = Math.ceil(
                (new Date(gc.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
              );

              return (
                <div
                  key={gc.id}
                  className={cn(
                    "flex min-w-[180px] items-center gap-2 rounded-lg border px-3 py-2",
                    daysUntilExpiry <= 7
                      ? "border-red-500/30 bg-red-500/10"
                      : "border-orange-500/30 bg-orange-500/10"
                  )}
                >
                  <AlertTriangle className={cn(
                    "h-4 w-4 flex-shrink-0",
                    daysUntilExpiry <= 7 ? "text-red-400" : "text-orange-400"
                  )} />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">
                      {gc.platform?.name || "Gift Card"}
                    </p>
                    <p className={cn(
                      "text-xs",
                      daysUntilExpiry <= 7 ? "text-red-400" : "text-orange-400"
                    )}>
                      {formatCurrency(gc.balance)} &bull; {daysUntilExpiry}d left
                    </p>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
