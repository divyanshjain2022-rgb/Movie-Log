"use client";

import { cn } from "@/lib/utils";

export type YearFilterValue = number | "all";

interface YearFilterProps {
  years: number[];
  value: YearFilterValue;
  onChange: (value: YearFilterValue) => void;
  className?: string;
}

export function YearFilter({ years, value, onChange, className }: YearFilterProps) {
  if (years.length === 0) return null;

  return (
    <div className={cn("flex gap-1.5 overflow-x-auto pb-1", className)}>
      <button
        type="button"
        onClick={() => onChange("all")}
        className={cn(
          "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
          value === "all"
            ? "bg-primary text-primary-foreground"
            : "bg-secondary/50 text-muted-foreground hover:text-foreground"
        )}
      >
        All Time
      </button>
      {years.map((year) => (
        <button
          key={year}
          type="button"
          onClick={() => onChange(year)}
          className={cn(
            "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
            value === year
              ? "bg-primary text-primary-foreground"
              : "bg-secondary/50 text-muted-foreground hover:text-foreground"
          )}
        >
          {year}
        </button>
      ))}
    </div>
  );
}
