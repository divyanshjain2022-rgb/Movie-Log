"use client";

import { PiggyBank, ThumbsUp, Meh, Shield } from "lucide-react";
import { formatCurrency } from "@/lib/formula";
import { cn } from "@/lib/utils";

interface QuickStatsProps {
  saved: number;
  greatCount: number;
  mehCount: number;
  passportSavings?: number;
}

export function QuickStats({ saved, greatCount, mehCount, passportSavings }: QuickStatsProps) {
  const stats = [
    {
      label: "GC Saved",
      value: formatCurrency(saved),
      icon: PiggyBank,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Great Films",
      value: greatCount.toString(),
      icon: ThumbsUp,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    ...(passportSavings && passportSavings > 0
      ? [
          {
            label: "Passport",
            value: formatCurrency(passportSavings),
            icon: Shield,
            color: "text-blue-400",
            bg: "bg-blue-500/10",
          },
        ]
      : [
          {
            label: "Meh",
            value: mehCount.toString(),
            icon: Meh,
            color: "text-muted-foreground",
            bg: "bg-secondary",
          },
        ]),
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-2xl bg-card/50 p-3.5 space-y-2.5"
        >
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", stat.bg)}>
            <stat.icon className={cn("h-[18px] w-[18px]", stat.color)} strokeWidth={1.75} />
          </div>
          <div>
            <div className={cn("text-xl font-bold tracking-tight", stat.color)}>
              {stat.value}
            </div>
            <div className="text-[11px] text-muted-foreground/70 font-medium">{stat.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
