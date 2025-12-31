"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export default function ExportPage() {
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const supabase = createClient();
            const { data: movies, error } = await supabase
                .from("movies")
                .select(`
          *,
          theater:theaters(name),
          format:formats(name),
          mood:moods(name),
          strongest_part:aspects!movies_strongest_part_id_fkey(name),
          weakest_part:aspects!movies_weakest_part_id_fkey(name),
          rewatch:rewatch_options(name),
          gift_card:gift_cards(code)
        `)
                .order("date", { ascending: false });

            if (error) throw error;

            if (!movies || movies.length === 0) {
                toast.error("No movies to export");
                return;
            }

            // Convert to CSV
            const headers = [
                "Title", "Date", "Theater", "Format", "Language",
                "Ticket Cost", "Initial Rating", "Mood", "Strongest Part", "Weakest Part", "Notes"
            ];

            const csvContent = [
                headers.join(","),
                ...movies.map((m: any) => [
                    `"${(m.title || "").replace(/"/g, '""')}"`,
                    m.date,
                    `"${(m.theater?.name || "").replace(/"/g, '""')}"`,
                    `"${(m.format?.name || "").replace(/"/g, '""')}"`,
                    m.language || "",
                    m.ticket_cost,
                    m.rating || "",
                    `"${(m.mood?.name || "").replace(/"/g, '""')}"`,
                    `"${(m.strongest_part?.name || "").replace(/"/g, '""')}"`,
                    `"${(m.weakest_part?.name || "").replace(/"/g, '""')}"`,
                    `"${(m.remarks || "").replace(/"/g, '""')}"`
                ].join(","))
            ].join("\n");

            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", `movie-log-export-${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast.success("Export complete!");
        } catch (error) {
            console.error(error);
            toast.error("Failed to export movies");
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="min-h-screen">
            <PageHeader title="Export Data" showBack />
            <div className="p-4">
                <div className="flex flex-col items-center justify-center space-y-4 rounded-lg border border-dashed p-8">
                    <Download className="h-12 w-12 text-muted-foreground" />
                    <div className="text-center">
                        <p className="text-lg font-medium">Export your Movie Log</p>
                        <p className="text-sm text-muted-foreground">Download all your movies as a CSV file.</p>
                    </div>
                    <Button onClick={handleExport} disabled={isExporting}>
                        {isExporting ? "Exporting..." : "Download CSV"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
