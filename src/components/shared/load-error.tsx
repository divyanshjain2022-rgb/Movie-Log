"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shown in place of a page's content when its data failed to load, so a
// failed request never reads as "nothing here".
export function LoadError({ what, error }: { what: string; error?: Error | string | null }) {
  const detail = typeof error === "string" ? error : error?.message;
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <WifiOff className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
      <p className="text-sm text-muted-foreground">
        Couldn&apos;t load {what}. Check your connection and try again.
      </p>
      {detail && <p className="text-xs text-muted-foreground/50">{detail}</p>}
      <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
        <RefreshCw className="h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}
