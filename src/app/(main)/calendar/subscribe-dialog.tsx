"use client";

import { useState } from "react";
import { CalendarPlus, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SubscribeDialog() {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const loadLink = async (open: boolean) => {
    if (!open || url) return;
    setFailed(false);
    try {
      const response = await fetch("/api/calendar-link");
      const payload = (await response.json()) as { url?: string };
      if (!response.ok || !payload.url) throw new Error("No link");
      setUrl(payload.url);
    } catch {
      setFailed(true);
    }
  };

  const copyLink = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it instead.");
    }
  };

  const webcal = url?.replace(/^https?:/, "webcal:");

  return (
    <Dialog onOpenChange={loadLink}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Add to your calendar app">
          <CalendarPlus className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to your calendar app</DialogTitle>
          <DialogDescription>
            Every show you log, past and booked, appears in your calendar and stays up to date.
          </DialogDescription>
        </DialogHeader>
        {failed ? (
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t get your calendar link. Check your connection, then close this and try again.
          </p>
        ) : !url || !webcal ? (
          <p className="text-sm text-muted-foreground">Getting your link…</p>
        ) : (
          <div className="space-y-3">
            <Button asChild className="w-full">
              <a
                href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`}
                target="_blank"
                rel="noreferrer"
              >
                Add to Google Calendar
              </a>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <a href={webcal}>Add to Apple Calendar</a>
            </Button>
            <div className="flex gap-2">
              <Input readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
              <Button variant="outline" size="icon" aria-label="Copy link" onClick={copyLink}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Google Calendar can take several hours to show changes. Keep this link to yourself:
              anyone who has it can see your movie times.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
