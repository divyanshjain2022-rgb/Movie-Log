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
    <nav
      className="fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="glass-strong flex h-16 w-full max-w-md items-center justify-around rounded-[28px] px-2">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-col items-center gap-0.5 px-3 py-1.5 transition-all duration-300",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground/60 active:text-muted-foreground"
              )}
            >
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-2xl transition-all duration-300",
                isActive && "bg-primary/15 scale-105 shadow-[0_0_16px_-4px_rgba(245,158,11,0.5)]"
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
    </nav>
  );
}
