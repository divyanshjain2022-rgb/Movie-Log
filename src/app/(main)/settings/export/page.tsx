"use client";

import { useState } from "react";
import { Download, FileText, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/formula";
import { toast } from "sonner";

export default function ExportPage() {
  const [isExportingCSV, setIsExportingCSV] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const fetchAllMovies = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
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
    return data || [];
  };

  const handleExportCSV = async () => {
    setIsExportingCSV(true);
    try {
      const movies = await fetchAllMovies();

      if (movies.length === 0) {
        toast.error("No movies to export");
        return;
      }

      const headers = [
        "Title", "Date", "Showtime", "Theater", "Audi", "Format", "Seat",
        "Language", "Director", "Cast", "Composer", "Cinematographer",
        "Ticket Cost", "Convenience Fee", "F&B Cost", "F&B Items",
        "Other Expenses", "Passport Savings", "Total Cost",
        "Rating", "TMDB Rating", "Value Score", "Mood",
        "Strongest Part", "Weakest Part", "Rewatch Value",
        "Review", "Remarks", "Watched With", "Genres", "Keywords",
        "Runtime (min)", "Certification", "Budget ($)", "Box Office ($)",
        "Booking ID", "Status", "Is Rewatch"
      ];

      const esc = (val: string | number | null | undefined) => {
        if (val == null) return "";
        return `"${String(val).replace(/"/g, '""')}"`;
      };

      const csvContent = [
        headers.join(","),
        ...movies.map((m: Record<string, unknown>) => [
          esc(m.title as string),
          m.date,
          m.showtime || "",
          esc((m.theater as Record<string, string>)?.name),
          esc(m.audi as string),
          esc((m.format as Record<string, string>)?.name),
          esc(m.seat as string),
          esc(m.language as string),
          esc(m.director as string),
          esc((m.cast_members as string[])?.join("; ")),
          esc(m.composer as string),
          esc(m.cinematographer as string),
          m.ticket_cost || 0,
          m.convenience_fee || 0,
          m.fnb_cost || 0,
          esc(m.fnb_items as string),
          m.other_expenses || 0,
          m.passport_savings || 0,
          m.total_cost || 0,
          m.rating || "",
          m.tmdb_rating || "",
          m.value_score || "",
          esc((m.mood as Record<string, string>)?.name),
          esc((m.strongest_part as Record<string, string>)?.name),
          esc((m.weakest_part as Record<string, string>)?.name),
          esc((m.rewatch as Record<string, string>)?.name),
          esc(m.review as string),
          esc(m.remarks as string),
          esc(m.watched_with as string),
          esc((m.genres as string[])?.join("; ")),
          esc((m.keywords as string[])?.join("; ")),
          m.runtime_minutes || "",
          m.certification || "",
          m.budget || "",
          m.box_office || "",
          esc(m.booking_id as string),
          m.status || "watched",
          m.is_rewatch ? "Yes" : "No",
        ].join(","))
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `cinemalog-export-${new Date().toISOString().split("T")[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("CSV exported!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to export CSV");
    } finally {
      setIsExportingCSV(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    try {
      const movies = await fetchAllMovies();

      if (movies.length === 0) {
        toast.error("No movies to export");
        return;
      }

      // Dynamic import to avoid SSR issues
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const doc = new jsPDF();
      const year = new Date().getFullYear();

      // Title
      doc.setFontSize(20);
      doc.text("CinemaLog Report", 14, 20);
      doc.setFontSize(12);
      doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")}`, 14, 28);

      // Year Summary
      const yearMovies = movies.filter((m: Record<string, unknown>) =>
        new Date(m.date as string).getFullYear() === year
      );
      const totalSpend = yearMovies.reduce((s: number, m: Record<string, unknown>) => s + ((m.total_cost as number) || 0), 0);
      const avgRating = yearMovies.length > 0
        ? yearMovies.reduce((s: number, m: Record<string, unknown>) => s + ((m.rating as number) || 0), 0) / yearMovies.length
        : 0;

      doc.setFontSize(14);
      doc.text(`${year} Summary`, 14, 40);
      doc.setFontSize(10);
      doc.text(`Total Movies: ${yearMovies.length}`, 14, 48);
      doc.text(`Total Spend: ${formatCurrency(totalSpend)}`, 14, 54);
      doc.text(`Average Rating: ${avgRating.toFixed(1)}/10`, 14, 60);

      // Monthly Breakdown
      doc.setFontSize(14);
      doc.text("Monthly Breakdown", 14, 74);

      const monthlyRows = Array.from({ length: 12 }, (_, i) => {
        const mMovies = yearMovies.filter((m: Record<string, unknown>) => new Date(m.date as string).getMonth() === i);
        if (mMovies.length === 0) return null;
        return [
          new Date(2000, i).toLocaleString("default", { month: "long" }),
          String(mMovies.length),
          formatCurrency(mMovies.reduce((s: number, m: Record<string, unknown>) => s + ((m.total_cost as number) || 0), 0)),
          mMovies.filter((m: Record<string, unknown>) => m.rating).length > 0
            ? (mMovies.reduce((s: number, m: Record<string, unknown>) => s + ((m.rating as number) || 0), 0) /
              mMovies.filter((m: Record<string, unknown>) => m.rating).length).toFixed(1)
            : "-",
        ];
      }).filter(Boolean) as string[][];

      autoTable(doc, {
        startY: 78,
        head: [["Month", "Movies", "Spend", "Avg Rating"]],
        body: monthlyRows,
        theme: "grid",
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 9 },
      });

      // Full Movie List
      doc.addPage();
      doc.setFontSize(14);
      doc.text("Full Movie List", 14, 20);

      const movieRows = movies.map((m: Record<string, unknown>) => [
        (m.title as string) || "",
        (m.date as string) || "",
        (m.format as Record<string, string>)?.name || "",
        formatCurrency((m.total_cost as number) || 0),
        m.rating ? String((m.rating as number).toFixed(1)) : "-",
      ]);

      autoTable(doc, {
        startY: 24,
        head: [["Title", "Date", "Format", "Cost", "Rating"]],
        body: movieRows,
        theme: "grid",
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 60 },
        },
      });

      doc.save(`cinemalog-report-${new Date().toISOString().split("T")[0]}.pdf`);
      toast.success("PDF exported!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to export PDF");
    } finally {
      setIsExportingPDF(false);
    }
  };

  return (
    <div className="min-h-screen">
      <PageHeader title="Export Data" showBack />
      <div className="p-4 space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-5 w-5" />
              CSV Export
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Export all movies with all fields — costs, ratings, crew, TMDB data, and more.
            </p>
            <Button onClick={handleExportCSV} disabled={isExportingCSV}>
              <Download className="mr-2 h-4 w-4" />
              {isExportingCSV ? "Exporting..." : "Download CSV"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5" />
              PDF Report
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Formatted report with year summary, monthly breakdown, and full movie list.
            </p>
            <Button onClick={handleExportPDF} disabled={isExportingPDF} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              {isExportingPDF ? "Generating..." : "Download PDF"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
