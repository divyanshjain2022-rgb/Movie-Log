"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formula";
import { cn } from "@/lib/utils";

interface QuickStatsProps {
  saved: number;
  greatCount: number;
  mehCount: number;
}

export function QuickStats({ saved, greatCount, mehCount }: QuickStatsProps) {
  const stats = [
    {
      label: "Saved",
      value: formatCurrency(saved),
      className: "text-positive",
    },
    {
      label: "Great",
      value: greatCount.toString(),
      className: "text-primary",
    },
    {
      label: "Meh",
      value: mehCount.toString(),
      className: "text-muted-foreground",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {stats.map((stat) => (
        <Card key={stat.label} className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <div className={cn("text-xl font-bold", stat.className)}>
              {stat.value}
            </div>
            <div className="text-xs text-muted-foreground">{stat.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
