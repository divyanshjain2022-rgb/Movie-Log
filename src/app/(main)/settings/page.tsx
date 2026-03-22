"use client";

import Link from "next/link";
import {
  ChevronRight,
  Download,
  Upload,
  MapPin,
  Smile,
  Star,
  RotateCcw,
  Calculator,
  Wallet,
  Users,
  Clapperboard,
} from "lucide-react";
import { PageHeader } from "@/components/shared";

const settingsGroups = [
  {
    title: "Data",
    items: [
      { href: "/settings/export", icon: Download, label: "Export", desc: "CSV & PDF" },
      { href: "/settings/import", icon: Upload, label: "Import", desc: "From CSV" },
    ],
  },
  {
    title: "Features",
    items: [
      { href: "/settings/budget", icon: Wallet, label: "Budget", desc: "Monthly limits" },
      { href: "/companions", icon: Users, label: "Companions", desc: "Watch buddies" },
      { href: "/franchises", icon: Clapperboard, label: "Franchises", desc: "Movie series" },
    ],
  },
  {
    title: "Customize",
    items: [
      { href: "/settings/theaters", icon: MapPin, label: "Theaters", desc: "Your cinemas" },
      { href: "/settings/moods", icon: Smile, label: "Moods", desc: "Post-movie feels" },
      { href: "/settings/aspects", icon: Star, label: "Aspects", desc: "Rating criteria" },
      { href: "/settings/rewatch", icon: RotateCcw, label: "Rewatch", desc: "Would you again?" },
      { href: "/settings/formula", icon: Calculator, label: "Value Formula", desc: "Score config" },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="min-h-screen">
      <PageHeader title="Settings" />

      <div className="space-y-6 p-4 stagger">
        {settingsGroups.map((group) => (
          <section key={group.title}>
            <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/40">
              {group.title}
            </h2>
            <div className="rounded-2xl bg-card/40 overflow-hidden">
              {group.items.map((item, index) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between p-3.5 transition-all active:bg-secondary/30 hover:bg-secondary/20 ${
                    index !== group.items.length - 1 ? "border-b border-white/[0.03]" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-secondary/50">
                      <item.icon className="h-4 w-4 text-muted-foreground/60" strokeWidth={1.75} />
                    </div>
                    <div>
                      <span className="text-sm font-medium">{item.label}</span>
                      <p className="text-[11px] text-muted-foreground/40">{item.desc}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/20" />
                </Link>
              ))}
            </div>
          </section>
        ))}

        <p className="text-center text-[11px] text-muted-foreground/30 pb-4">
          CinemaLog v0.2.0
        </p>
      </div>
    </div>
  );
}
