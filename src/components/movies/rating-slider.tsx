"use client";

import { Slider } from "@/components/ui/slider";
import { getRatingColor, getRatingLabel } from "@/lib/formula";
import { cn } from "@/lib/utils";

interface RatingSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export function RatingSlider({
  value,
  onChange,
  min = 1,
  max = 10,
  step = 0.5,
}: RatingSliderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Rating</span>
        <div className="flex items-center gap-2">
          <span className={cn("text-2xl font-bold", getRatingColor(value))}>
            {value.toFixed(1)}
          </span>
          <span className="text-sm text-muted-foreground">
            {getRatingLabel(value)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{min}</span>
        <Slider
          value={[value]}
          onValueChange={(vals) => onChange(vals[0])}
          min={min}
          max={max}
          step={step}
          className="flex-1"
        />
        <span className="text-xs text-muted-foreground">{max}</span>
      </div>
    </div>
  );
}
