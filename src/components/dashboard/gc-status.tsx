"use client";

import Link from "next/link";
import { CreditCard, AlertTriangle, Plus, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/formula";
import { cn } from "@/lib/utils";
import type { GiftCardWithUsage } from "@/types";

interface GCStatusProps {
  giftCards: GiftCardWithUsage[];
}

export function GCStatus({ giftCards }: GCStatusProps) {
  const activeCards = giftCards.filter((gc) => gc.status === "active");
  const totalBalance = activeCards.reduce((sum, gc) => sum + gc.balance, 0);
  const expiringSoonCards = activeCards
    .map((gc) => ({
      ...gc,
      daysLeft: Math.ceil(
        (new Date(gc.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      ),
    }))
    .filter((gc) => gc.daysLeft <= 30 && gc.daysLeft > 0);

  if (activeCards.length === 0) {
    return (
      <Link href="/gift-cards">
        <div className="flex items-center justify-between rounded-2xl bg-card/30 p-4 transition-all active:scale-[0.98] hover:bg-card/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/80">
              <CreditCard className="h-5 w-5 text-muted-foreground/50" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-medium">No gift cards</p>
              <p className="text-xs text-muted-foreground/50">Tap to add</p>
            </div>
          </div>
          <Plus className="h-4 w-4 text-muted-foreground/40" />
        </div>
      </Link>
    );
  }

  return (
    <div className="space-y-3">
      <Link href="/gift-cards">
        <div className="flex items-center justify-between rounded-2xl bg-emerald-500/[0.06] p-4 transition-all active:scale-[0.98] hover:bg-emerald-500/[0.10]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15">
              <CreditCard className="h-5 w-5 text-emerald-400" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground/60">Balance</p>
              <p className="text-lg font-bold text-emerald-400 tracking-tight">{formatCurrency(totalBalance)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground/50">
            <span className="text-xs">{activeCards.length} cards</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </div>
      </Link>

      {expiringSoonCards.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/45">
              Expiring Soon
            </p>
            <p className="text-[11px] text-muted-foreground/45">
              {expiringSoonCards.length} {expiringSoonCards.length === 1 ? "card" : "cards"}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {expiringSoonCards.map((gc) => {
              const urgent = gc.daysLeft <= 7;

              return (
                <div
                  key={gc.id}
                  className={cn(
                    "flex min-h-[68px] items-center gap-2 rounded-2xl border px-3.5 py-3",
                    urgent
                      ? "border-red-500/12 bg-red-500/8"
                      : "border-orange-500/12 bg-orange-500/8"
                  )}
                >
                  <AlertTriangle
                    className={cn(
                      "h-3.5 w-3.5 flex-shrink-0",
                      urgent ? "text-red-400/80" : "text-orange-400/80"
                    )}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">
                      {gc.platform?.name || "Gift Card"}
                    </p>
                    <p
                      className={cn(
                        "text-[11px]",
                        urgent ? "text-red-400/70" : "text-orange-400/70"
                      )}
                    >
                      {formatCurrency(gc.balance)} · {gc.daysLeft}d left
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
