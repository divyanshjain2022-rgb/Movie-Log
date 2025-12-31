"use client";

import Link from "next/link";
import { ChevronRight, Download, Palette, MapPin, Smile, Star, RotateCcw, Calculator } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared";

const settingsGroups = [
  {
    title: "Data",
    items: [
      { href: "/settings/export", icon: Download, label: "Export to CSV" },
    ],
  },
  {
    title: "Customize",
    items: [
      { href: "/settings/theaters", icon: MapPin, label: "Theaters" },
      { href: "/settings/moods", icon: Smile, label: "Moods" },
      { href: "/settings/aspects", icon: Star, label: "Aspects" },
      { href: "/settings/rewatch", icon: RotateCcw, label: "Rewatch Options" },
      { href: "/settings/formula", icon: Calculator, label: "Value Formula" },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="min-h-screen">
      <PageHeader title="Settings" />

      <div className="space-y-6 p-4">
        {settingsGroups.map((group) => (
          <section key={group.title}>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              {group.title}
            </h2>
            <Card>
              <CardContent className="p-0">
                {group.items.map((item, index) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between p-4 transition-colors hover:bg-secondary/50 ${index !== group.items.length - 1 ? "border-b border-border" : ""
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="h-5 w-5 text-muted-foreground" />
                      <span>{item.label}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </CardContent>
            </Card>
          </section>
        ))}

        <p className="text-center text-xs text-muted-foreground">
          CinemaLog v0.1.0
        </p>
      </div>
    </div>
  );
}
