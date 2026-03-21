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
      gradient: "from-emerald-500/20 to-emerald-500/5",
      iconBg: "bg-emerald-500/20",
      iconColor: "text-emerald-400",
      valueColor: "text-emerald-400",
    },
    {
      label: "Great Films",
      value: greatCount.toString(),
      icon: ThumbsUp,
      gradient: "from-primary/20 to-primary/5",
      iconBg: "bg-primary/20",
      iconColor: "text-primary",
      valueColor: "text-primary",
    },
    ...(passportSavings && passportSavings > 0
      ? [
          {
            label: "Passport",
            value: formatCurrency(passportSavings),
            icon: Shield,
            gradient: "from-blue-500/20 to-blue-500/5",
            iconBg: "bg-blue-500/20",
            iconColor: "text-blue-400",
            valueColor: "text-blue-400",
          },
        ]
      : [
          {
            label: "Meh",
            value: mehCount.toString(),
            icon: Meh,
            gradient: "from-secondary to-secondary/50",
            iconBg: "bg-secondary",
            iconColor: "text-muted-foreground",
            valueColor: "text-muted-foreground",
          },
        ]),
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={cn(
            "relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br p-4",
            stat.gradient
          )}
        >
          <div className={cn("mb-2 flex h-8 w-8 items-center justify-center rounded-lg", stat.iconBg)}>
            <stat.icon className={cn("h-4 w-4", stat.iconColor)} />
          </div>
          <div className={cn("text-xl font-bold", stat.valueColor)}>
            {stat.value}
          </div>
          <div className="text-xs text-muted-foreground">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
