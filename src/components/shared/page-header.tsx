"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  showBack?: boolean;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  showBack = false,
  action,
  className,
}: PageHeaderProps) {
  const router = useRouter();

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 items-center justify-between bg-background/60 backdrop-blur-2xl px-4 border-b border-white/[0.06]",
        className
      )}
    >
      <div className="flex items-center gap-2.5">
        {showBack && (
          <button
            onClick={() => router.back()}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground active:scale-95"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
          </button>
        )}
        <h1 className="text-[17px] font-semibold tracking-tight">{title}</h1>
      </div>
      {action && <div>{action}</div>}
    </header>
  );
}
