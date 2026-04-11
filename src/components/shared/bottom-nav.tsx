"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BarChart3, Film, Settings, Coffee } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/movies", icon: Film, label: "Movies" },
  { href: "/fnb", icon: Coffee, label: "F&B" },
  { href: "/stats", icon: BarChart3, label: "Stats" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-2xl border-t border-white/[0.04]">
      <div className="mx-auto flex h-[68px] max-w-lg items-center justify-around px-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-col items-center gap-0.5 px-4 py-1.5 transition-all duration-300",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground/60 active:text-muted-foreground"
              )}
            >
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-2xl transition-all duration-300",
                isActive && "bg-primary/12 scale-105"
              )}>
                <item.icon
                  className="h-[22px] w-[22px] transition-all duration-300"
                  strokeWidth={isActive ? 2.25 : 1.75}
                />
              </div>
              <span className={cn(
                "text-[10px] tracking-wide transition-all duration-300",
                isActive ? "font-semibold text-primary" : "font-normal"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Safe area padding for iOS */}
      <div className="h-safe-area-inset-bottom bg-background/80" />
    </nav>
  );
}
