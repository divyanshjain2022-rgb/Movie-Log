"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCreateTheaterRating } from "@/hooks";
import { cn } from "@/lib/utils";

interface TheaterRatingFormProps {
  theaterId: string;
  audi?: string;
  movieId?: string;
  onSuccess?: () => void;
  children: React.ReactNode;
}

function StarRating({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm">{label}</Label>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star === value ? 0 : star)}
            className="p-0.5"
          >
            <Star
              className={cn(
                "h-5 w-5 transition-colors",
                star <= value
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-muted-foreground/30"
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export function TheaterRatingForm({
  theaterId,
  audi,
  movieId,
  onSuccess,
  children,
}: TheaterRatingFormProps) {
  const { createRating, isLoading } = useCreateTheaterRating();
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(0);
  const [seat, setSeat] = useState(0);
  const [screen, setScreen] = useState(0);
  const [cleanliness, setCleanliness] = useState(0);
  const [notes, setNotes] = useState("");

  const handleSubmit = async () => {
    if (sound === 0 && seat === 0 && screen === 0 && cleanliness === 0) {
      toast.error("Rate at least one aspect");
      return;
    }

    try {
      await createRating({
        theater_id: theaterId,
        audi: audi || null,
        sound: sound || null,
        seat: seat || null,
        screen: screen || null,
        cleanliness: cleanliness || null,
        notes: notes || null,
        movie_id: movieId || null,
      });
      toast.success("Rating saved");
      setOpen(false);
      setSound(0);
      setSeat(0);
      setScreen(0);
      setCleanliness(0);
      setNotes("");
      onSuccess?.();
    } catch {
      toast.error("Failed to save rating");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rate Theater{audi ? ` - ${audi}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <StarRating value={sound} onChange={setSound} label="Sound" />
          <StarRating value={seat} onChange={setSeat} label="Seats" />
          <StarRating value={screen} onChange={setScreen} label="Screen" />
          <StarRating
            value={cleanliness}
            onChange={setCleanliness}
            label="Cleanliness"
          />
          <div>
            <Label>Notes</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about the theater..."
              className="mt-1"
            />
          </div>
          <Button onClick={handleSubmit} disabled={isLoading} className="w-full">
            {isLoading ? "Saving..." : "Save Rating"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
