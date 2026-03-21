"use client";

import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";

const MOVIE_FIELDS: Array<{ key: string; label: string; required?: boolean }> = [
  { key: "title", label: "Title", required: true },
  { key: "date", label: "Date", required: true },
  { key: "theater", label: "Theater" },
  { key: "format", label: "Format" },
  { key: "language", label: "Language" },
  { key: "ticket_cost", label: "Ticket Cost" },
  { key: "convenience_fee", label: "Booking Fee" },
  { key: "fnb_cost", label: "F&B Cost" },
  { key: "rating", label: "Rating" },
  { key: "review", label: "Review" },
  { key: "remarks", label: "Remarks" },
  { key: "seat", label: "Seat" },
  { key: "audi", label: "Audi/Screen" },
  { key: "watched_with", label: "Watched With" },
  { key: "director", label: "Director" },
  { key: "genres", label: "Genres" },
  { key: "showtime", label: "Showtime" },
  { key: "skip", label: "-- Skip --" },
];

type ColumnMapping = Record<number, string>;

interface ParsedRow {
  [key: string]: string;
}

export default function ImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<ParsedRow[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const Papa = (await import("papaparse")).default;

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data.length === 0) {
            toast.error("No data found in CSV");
            return;
          }

          const headers = results.meta.fields || [];
          setCsvHeaders(headers);
          setCsvData(results.data as ParsedRow[]);
          setImportResult(null);

          // Auto-map columns by fuzzy matching
          const mapping: ColumnMapping = {};
          headers.forEach((header, i) => {
            const lower = header.toLowerCase().trim();
            const match = MOVIE_FIELDS.find(
              (f) =>
                f.key !== "skip" &&
                (lower === f.key ||
                  lower === f.label.toLowerCase() ||
                  lower.includes(f.key) ||
                  f.key.includes(lower))
            );
            if (match) {
              mapping[i] = match.key;
            }
          });
          setColumnMapping(mapping);

          toast.success(`Loaded ${results.data.length} rows`);
        },
        error: (error) => {
          toast.error(`Parse error: ${error.message}`);
        },
      });
    } catch {
      toast.error("Failed to parse CSV");
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImport = async () => {
    // Validate required fields are mapped
    const titleCol = Object.entries(columnMapping).find(([, v]) => v === "title");
    const dateCol = Object.entries(columnMapping).find(([, v]) => v === "date");

    if (!titleCol || !dateCol) {
      toast.error("Title and Date columns must be mapped");
      return;
    }

    setIsImporting(true);
    setImportProgress(0);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Not authenticated");
      setIsImporting(false);
      return;
    }

    let success = 0;
    let failed = 0;

    // Process in batches of 10
    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      try {
        const movieData: Record<string, unknown> = {
          user_id: user.id,
          ticket_cost: 0,
          convenience_fee: 0,
          passport_savings: 0,
          total_cost: 0,
        };

        // Map CSV columns to movie fields
        Object.entries(columnMapping).forEach(([colIdx, fieldKey]) => {
          if (fieldKey === "skip") return;
          const header = csvHeaders[Number(colIdx)];
          const value = row[header]?.trim();
          if (!value) return;

          switch (fieldKey) {
            case "ticket_cost":
            case "convenience_fee":
            case "fnb_cost":
            case "rating":
              movieData[fieldKey] = parseFloat(value) || 0;
              break;
            case "genres":
              movieData[fieldKey] = value.split(/[,;]/).map((g: string) => g.trim()).filter(Boolean);
              break;
            default:
              movieData[fieldKey] = value;
          }
        });

        // Ensure required fields
        if (!movieData.title || !movieData.date) {
          failed++;
          continue;
        }

        // Calculate total cost
        const ticket = (movieData.ticket_cost as number) || 0;
        const fee = (movieData.convenience_fee as number) || 0;
        const fnb = (movieData.fnb_cost as number) || 0;
        const savings = (movieData.passport_savings as number) || 0;
        movieData.total_cost = ticket + fee + fnb - savings;

        // Remove theater/format strings (would need lookup IDs - skip for now)
        delete movieData.theater;
        delete movieData.format;

        const { error } = await supabase.from("movies").insert(movieData as never);
        if (error) {
          console.error(`Row ${i}: `, error);
          failed++;
        } else {
          success++;
        }
      } catch (err) {
        console.error(`Row ${i}: `, err);
        failed++;
      }

      setImportProgress(Math.round(((i + 1) / csvData.length) * 100));
    }

    setIsImporting(false);
    setImportResult({ success, failed });

    if (failed === 0) {
      toast.success(`Imported ${success} movies!`);
    } else {
      toast.warning(`Imported ${success}, failed ${failed}`);
    }
  };

  return (
    <div className="min-h-screen">
      <PageHeader title="Import Data" showBack />

      <div className="p-4 space-y-4">
        {/* Upload */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-5 w-5" />
              Upload CSV
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Upload a CSV file exported from Numbers, Excel, or CinemaLog.
            </p>
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Choose File
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileUpload}
            />
          </CardContent>
        </Card>

        {/* Column Mapping */}
        {csvHeaders.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Map Columns ({csvData.length} rows)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {csvHeaders.map((header, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-1/3 text-sm font-medium truncate">
                      {header}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <Select
                      value={columnMapping[i] || "skip"}
                      onValueChange={(v) =>
                        setColumnMapping((prev) => ({ ...prev, [i]: v }))
                      }
                    >
                      <SelectTrigger className="w-1/2 h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MOVIE_FIELDS.map((f) => (
                          <SelectItem key={f.key} value={f.key}>
                            {f.label}
                            {f.required && " *"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preview */}
        {csvData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Preview (first 3 rows)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr>
                      {csvHeaders.map((h, i) => (
                        <th key={i} className="px-2 py-1 text-left whitespace-nowrap font-medium text-muted-foreground">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 3).map((row, i) => (
                      <tr key={i} className="border-t">
                        {csvHeaders.map((h, j) => (
                          <td key={j} className="px-2 py-1 whitespace-nowrap max-w-[120px] truncate">
                            {row[h] || ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Import Button */}
        {csvData.length > 0 && !importResult && (
          <Button
            onClick={handleImport}
            disabled={isImporting}
            className="w-full"
          >
            {isImporting ? (
              <>Importing... {importProgress}%</>
            ) : (
              <>Import {csvData.length} Movies</>
            )}
          </Button>
        )}

        {/* Progress */}
        {isImporting && (
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${importProgress}%` }}
            />
          </div>
        )}

        {/* Results */}
        {importResult && (
          <Card>
            <CardContent className="p-4 text-center">
              {importResult.failed === 0 ? (
                <div className="flex flex-col items-center gap-2">
                  <Check className="h-8 w-8 text-green-500" />
                  <p className="font-medium">
                    Successfully imported {importResult.success} movies!
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <AlertCircle className="h-8 w-8 text-yellow-500" />
                  <p className="font-medium">
                    Imported {importResult.success}, failed {importResult.failed}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Check console for error details
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
