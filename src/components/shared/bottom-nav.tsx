"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BarChart3, Film, Settings, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/movies", icon: Film, label: "Movies" },
  { href: "/year-wrapped", icon: Sparkles, label: "Wrapped" },
  { href: "/stats", icon: BarChart3, label: "Stats" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around px-2">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs transition-all duration-200",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {/* Active indicator */}
              {isActive && (
                <div className="absolute -top-1 left-1/2 h-1 w-6 -translate-x-1/2 rounded-full bg-primary" />
              )}

              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-xl transition-all",
                isActive && "bg-primary/15"
              )}>
                <item.icon
                  className={cn(
                    "h-5 w-5 transition-all",
                    isActive && "scale-110"
                  )}
                  strokeWidth={isActive ? 2.5 : 2}
                />
              </div>
              <span className={cn(
                "transition-all",
                isActive ? "font-medium" : "font-normal"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Safe area padding for iOS */}
      <div className="h-safe-area-inset-bottom bg-background" />
    </nav>
  );
}
