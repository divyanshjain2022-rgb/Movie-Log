import { Film } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-2xl border-b border-white/[0.04]">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/25 to-amber-600/15 ring-1 ring-primary/25">
              <Film className="h-4 w-4 text-primary" strokeWidth={2} />
            </div>
            <span className="marquee text-gradient-gold text-[22px] leading-none">CINEMALOG</span>
          </div>
        </div>
      </header>
      <div className="space-y-5 p-4">
        <Skeleton className="h-9 w-full rounded-xl" />
        <Skeleton className="h-[180px] w-full rounded-3xl" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-[100px] rounded-2xl" />
          <Skeleton className="h-[100px] rounded-2xl" />
          <Skeleton className="h-[100px] rounded-2xl" />
        </div>
        <Skeleton className="h-[88px] rounded-2xl" />
        <Skeleton className="h-[88px] rounded-2xl" />
      </div>
    </div>
  );
}
