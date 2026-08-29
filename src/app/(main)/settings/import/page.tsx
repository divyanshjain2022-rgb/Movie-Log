"use client";

import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, Check, AlertCircle, Trash2 } from "lucide-react";
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
import { PageHeader } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const MOVIE_FIELDS: Array<{ key: string; label: string; required?: boolean }> = [
  { key: "title", label: "Title", required: true },
  { key: "date_day", label: "Date (day of month)", required: true },
  { key: "month", label: "Month" },
  { key: "day_name", label: "Day of Week" },
  { key: "theater", label: "Theater" },
  { key: "format", label: "Format" },
  { key: "language", label: "Language" },
  { key: "runtime_minutes", label: "Runtime" },
  { key: "ticket_cost", label: "Ticket Cost" },
  { key: "convenience_fee", label: "Booking Fee" },
  { key: "passport_savings", label: "Passport Savings" },
  { key: "fnb_cost", label: "F&B Cost" },
  { key: "other_expenses", label: "Other Expenses" },
  { key: "rating", label: "Rating" },
  { key: "review", label: "Review" },
  { key: "remarks", label: "Remarks" },
  { key: "audi", label: "Audi/Screen" },
  { key: "fnb_items", label: "F&B Items" },
  { key: "showtime", label: "Showtime" },
  { key: "genres", label: "Genres" },
  { key: "mood", label: "Mood" },
  { key: "rewatch", label: "Rewatch Value" },
  { key: "strongest_part", label: "Strongest Part" },
  { key: "weakest_part", label: "Weakest Part" },
  { key: "skip", label: "-- Skip --" },
];

// Maps for auto-detecting CSV header → field key
const HEADER_ALIASES: Record<string, string> = {
  "movie title": "title",
  "title": "title",
  "date": "date_day",
  "month": "month",
  "day": "day_name",
  "genre": "genres",
  "language": "language",
  "runtime": "runtime_minutes",
  "ticket cost": "ticket_cost",
  "convenience fees": "convenience_fee",
  "convenience fee": "convenience_fee",
  "booking fee": "convenience_fee",
  "pvr passport  savings": "passport_savings",
  "pvr passport savings": "passport_savings",
  "passport savings": "passport_savings",
  "f&b spending": "fnb_cost",
  "f&b cost": "fnb_cost",
  "fnb cost": "fnb_cost",
  "other expenses": "other_expenses",
  "time": "showtime",
  "place": "theater",
  "format": "format",
  "audi": "audi",
  "items bought": "fnb_items",
  "rating": "rating",
  "review": "review",
  "mood after watching": "mood",
  "rewatch value": "rewatch",
  "strongest part": "strongest_part",
  "weakest part": "weakest_part",
  "remarks": "remarks",
};

type ColumnMapping = Record<number, string>;

interface MovieRow {
  [key: string]: string;
}

export default function ImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<MovieRow[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [importYear, setImportYear] = useState(new Date().getFullYear());
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importLog, setImportLog] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<{ success: number; skipped: number; failed: number } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const Papa = (await import("papaparse")).default;

      Papa.parse(file, {
        header: false,
        skipEmptyLines: "greedy",
        complete: (results) => {
          const rows = results.data as string[][];
          if (rows.length === 0) {
            toast.error("No data found in CSV");
            return;
          }

          // Find the header row (contains "Movie Title" or "Title" in any cell)
          let headerIdx = -1;
          for (let i = 0; i < Math.min(rows.length, 20); i++) {
            const row = rows[i];
            if (row.some((cell) => /movie title|^title$/i.test(cell.trim()))) {
              headerIdx = i;
              break;
            }
          }

          if (headerIdx === -1) {
            // Fallback: use first row as header
            headerIdx = 0;
          }

          const headers = rows[headerIdx].map((h) => h.trim());
          const dataRows = rows.slice(headerIdx + 1);

          // Convert to objects and filter out summary/empty rows
          const parsed: MovieRow[] = [];
          for (const row of dataRows) {
            const obj: MovieRow = {};
            headers.forEach((h, i) => {
              obj[h] = (row[i] || "").trim();
            });
            parsed.push(obj);
          }

          // Find the title column header
          const titleHeader = headers.find((h) => /movie title|^title$/i.test(h)) || headers[0];

          // Filter: keep only rows that have a title (skip summary rows and empties)
          const movieRows = parsed.filter((row) => {
            const title = row[titleHeader];
            // Skip empty, numeric-only (monthly totals), or rows starting with numbers followed by nothing
            if (!title) return false;
            if (/^\d+(\+\d+)?(\s+Rewatch.*)?$/.test(title)) return false;
            return true;
          });

          setCsvHeaders(headers);
          setCsvData(movieRows);
          setImportResult(null);
          setImportLog([]);

          // Auto-map columns
          const mapping: ColumnMapping = {};
          headers.forEach((header, i) => {
            const lower = header.toLowerCase().trim();
            const alias = HEADER_ALIASES[lower];
            if (alias) {
              mapping[i] = alias;
            }
          });

          // Skip columns that aren't useful: "Total Ticket Cost", "Total", "Rating vs Cost", "Day"
          headers.forEach((header, i) => {
            const lower = header.toLowerCase().trim();
            if (
              lower === "total ticket cost" ||
              lower === "total" ||
              lower === "rating vs cost"
            ) {
              mapping[i] = "skip";
            }
          });

          setColumnMapping(mapping);
          toast.success(`Found ${movieRows.length} movies`);
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
    const titleColEntry = Object.entries(columnMapping).find(([, v]) => v === "title");
    const dateColEntry = Object.entries(columnMapping).find(([, v]) => v === "date_day");

    if (!titleColEntry) {
      toast.error("Title column must be mapped");
      return;
    }
    if (!dateColEntry) {
      toast.error("Date (day of month) column must be mapped");
      return;
    }

    setIsImporting(true);
    setImportProgress(0);
    setImportLog([]);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Not authenticated");
      setIsImporting(false);
      return;
    }

    // Fetch lookup data for resolving names → IDs
    const [formatsRes, theatersRes, moodsRes, aspectsRes, rewatchRes] = await Promise.all([
      supabase.from("formats").select("*"),
      supabase.from("theaters").select("*"),
      supabase.from("moods").select("*"),
      supabase.from("aspects").select("*"),
      supabase.from("rewatch_options").select("*"),
    ]);

    const formats = (formatsRes.data || []) as Array<{ id: string; name: string }>;
    const theaters = (theatersRes.data || []) as Array<{ id: string; name: string }>;
    const moods = (moodsRes.data || []) as Array<{ id: string; name: string }>;
    const aspects = (aspectsRes.data || []) as Array<{ id: string; name: string }>;
    const rewatchOptions = (rewatchRes.data || []) as Array<{ id: string; name: string }>;

    // Helper: fuzzy find by name (case-insensitive, partial match)
    const findByName = (list: Array<{ id: string; name: string }>, name: string) => {
      if (!name) return null;
      const lower = name.toLowerCase().trim();
      return list.find((item) => item.name.toLowerCase() === lower)
        || list.find((item) => item.name.toLowerCase().includes(lower) || lower.includes(item.name.toLowerCase()))
        || null;
    };

    // Month name → number
    const monthMap: Record<string, number> = {
      january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
      july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
      jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };

    let success = 0;
    let skipped = 0;
    let failed = 0;
    const log: string[] = [];

    // Track current month for carry-forward
    let currentMonth = 1;

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      try {
        // Extract mapped values
        const getValue = (fieldKey: string): string => {
          const entry = Object.entries(columnMapping).find(([, v]) => v === fieldKey);
          if (!entry) return "";
          const header = csvHeaders[Number(entry[0])];
          return (row[header] || "").trim();
        };

        const title = getValue("title");
        if (!title) {
          skipped++;
          continue;
        }

        // Handle month carry-forward
        const monthStr = getValue("month");
        if (monthStr) {
          const parsed = monthMap[monthStr.toLowerCase()];
          if (parsed) currentMonth = parsed;
        }

        // Build date
        const dayStr = getValue("date_day");
        const day = parseInt(dayStr, 10);
        if (!day || day < 1 || day > 31) {
          log.push(`Skipped "${title}": invalid date "${dayStr}"`);
          skipped++;
          continue;
        }
        const dateStr = `${importYear}-${String(currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

        // Parse numeric fields
        const parseNum = (val: string) => {
          const n = parseFloat(val.replace(/[₹,]/g, ""));
          return isNaN(n) ? 0 : n;
        };

        const ticketCost = parseNum(getValue("ticket_cost"));
        const convenienceFee = parseNum(getValue("convenience_fee"));
        const passportSavings = parseNum(getValue("passport_savings"));
        const fnbCost = parseNum(getValue("fnb_cost"));
        const otherExpenses = parseNum(getValue("other_expenses"));
        const rating = parseNum(getValue("rating")) || null;

        // Parse runtime (handle "125 Minutes" or "125")
        const runtimeStr = getValue("runtime_minutes");
        const runtime = parseInt(runtimeStr.replace(/[^0-9]/g, ""), 10) || null;

        // Resolve lookups
        const formatName = getValue("format");
        const theaterName = getValue("theater");
        const moodName = getValue("mood");
        const rewatchName = getValue("rewatch");
        const strongestName = getValue("strongest_part");
        const weakestName = getValue("weakest_part");

        const format = findByName(formats, formatName);
        const theater = findByName(theaters, theaterName);
        const mood = findByName(moods, moodName);
        const rewatch = findByName(rewatchOptions, rewatchName);
        const strongest = findByName(aspects, strongestName);
        const weakest = findByName(aspects, weakestName);

        // Parse genres
        const genreStr = getValue("genres");
        const genres = genreStr
          ? genreStr.split(/[,;]/).map((g) => g.trim()).filter(Boolean)
          : null;

        // Parse showtime → HH:MM format
        let showtime: string | null = null;
        const timeStr = getValue("showtime");
        if (timeStr) {
          const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
          if (timeMatch) {
            let h = parseInt(timeMatch[1], 10);
            const m = timeMatch[2];
            const ampm = timeMatch[3]?.toUpperCase();
            if (ampm === "PM" && h < 12) h += 12;
            if (ampm === "AM" && h === 12) h = 0;
            showtime = `${String(h).padStart(2, "0")}:${m}`;
          }
        }

        const movieData: Record<string, unknown> = {
          user_id: user.id,
          title,
          date: dateStr,
          showtime,
          theater_id: theater?.id || null,
          format_id: format?.id || null,
          audi: getValue("audi") || null,
          ticket_cost: ticketCost,
          convenience_fee: convenienceFee,
          passport_savings: passportSavings,
          fnb_cost: fnbCost || null,
          fnb_items: getValue("fnb_items") || null,
          other_expenses: otherExpenses || null,
          rating,
          review: getValue("review") || null,
          remarks: getValue("remarks") || null,
          mood_id: mood?.id || null,
          rewatch_id: rewatch?.id || null,
          strongest_part_id: strongest?.id || null,
          weakest_part_id: weakest?.id || null,
          language: getValue("language") || null,
          runtime_minutes: runtime,
          genres,
          status: "watched" as const,
        };

        const { data: insertedMovie, error } = await supabase
          .from("movies")
          .insert(movieData as never)
          .select("id")
          .single();
        if (error) {
          log.push(`Failed "${title}": ${error.message}`);
          failed++;
        } else {
          // TMDB enrichment
          try {
            const searchRes = await fetch(`/api/tmdb?query=${encodeURIComponent(title)}`);
            if (searchRes.ok) {
              const searchData = await searchRes.json();
              const tmdbMatch = searchData.results?.[0];
              if (tmdbMatch?.tmdb_id) {
                const detailRes = await fetch(`/api/tmdb?id=${tmdbMatch.tmdb_id}`);
                if (detailRes.ok) {
                  const tmdb = await detailRes.json();
                  const enrichment: Record<string, unknown> = {
                    tmdb_id: tmdb.tmdb_id,
                    poster_url: tmdb.poster_url,
                    director: tmdb.director || movieData.director,
                    cast_members: tmdb.cast_members,
                    composer: tmdb.composer,
                    cinematographer: tmdb.cinematographer,
                    budget: tmdb.budget,
                    box_office: tmdb.box_office,
                    tmdb_rating: tmdb.tmdb_rating,
                    tmdb_vote_count: tmdb.tmdb_vote_count,
                    certification: tmdb.certification,
                    trailer_url: tmdb.trailer_url,
                    keywords: tmdb.keywords,
                    overview: tmdb.overview,
                    release_date: tmdb.release_date,
                  };
                  // Only override runtime/genres if not already set from CSV
                  if (!runtime && tmdb.runtime_minutes) enrichment.runtime_minutes = tmdb.runtime_minutes;
                  if (!genres && tmdb.genres) enrichment.genres = tmdb.genres;

                  await supabase
                    .from("movies")
                    .update(enrichment as never)
                    .eq("id", (insertedMovie as { id: string }).id);
                }
              }
            }
          } catch {
            // TMDB enrichment is best-effort, don't fail the import
          }

          const warnings: string[] = [];
          if (formatName && !format) warnings.push(`format "${formatName}" not found`);
          if (theaterName && !theater) warnings.push(`theater "${theaterName}" not found`);
          if (moodName && !mood) warnings.push(`mood "${moodName}" not found`);
          if (warnings.length > 0) {
            log.push(`Imported "${title}" (${dateStr}) — ⚠ ${warnings.join(", ")}`);
          } else {
            log.push(`Imported "${title}" (${dateStr})`);
          }
          success++;
        }
      } catch (err) {
        const title = row[csvHeaders[0]] || `Row ${i}`;
        log.push(`Error "${title}": ${err instanceof Error ? err.message : "Unknown error"}`);
        failed++;
      }

      setImportProgress(Math.round(((i + 1) / csvData.length) * 100));
    }

    setIsImporting(false);
    setImportLog(log);
    setImportResult({ success, skipped, failed });

    if (failed === 0 && skipped === 0) {
      toast.success(`Imported ${success} movies!`);
    } else if (failed === 0) {
      toast.success(`Imported ${success}, skipped ${skipped}`);
    } else {
      toast.warning(`Imported ${success}, failed ${failed}, skipped ${skipped}`);
    }
  };

  const clearData = () => {
    setCsvHeaders([]);
    setCsvData([]);
    setColumnMapping({});
    setImportResult(null);
    setImportLog([]);
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
              Upload your Movie Log CSV. Multi-section CSVs (with format tables at the top) are
              auto-detected — the importer finds the movie data header row automatically.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                Choose File
              </Button>
              {csvData.length > 0 && (
                <Button variant="outline" onClick={clearData}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileUpload}
            />
          </CardContent>
        </Card>

        {/* Year Selection */}
        {csvHeaders.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Import Year</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">
                Your CSV has Month + Day but no year. Select the year for these movies.
              </p>
              <div className="flex gap-2">
                {[2024, 2025, 2026].map((y) => (
                  <button
                    key={y}
                    onClick={() => setImportYear(y)}
                    className={cn(
                      "rounded-lg px-4 py-2 text-sm font-medium transition-all",
                      importYear === y
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Column Mapping */}
        {csvHeaders.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Map Columns ({csvData.length} movies found)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                {csvHeaders.map((header, i) => {
                  const mapped = columnMapping[i];
                  const field = MOVIE_FIELDS.find((f) => f.key === mapped);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-2/5 text-xs font-medium truncate" title={header}>
                        {header}
                      </span>
                      <span className="text-muted-foreground/40 text-xs">→</span>
                      <Select
                        value={mapped || "skip"}
                        onValueChange={(v) =>
                          setColumnMapping((prev) => ({ ...prev, [i]: v }))
                        }
                      >
                        <SelectTrigger className={cn(
                          "w-1/2 h-8 text-xs",
                          field?.required && "border-primary/50"
                        )}>
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
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preview */}
        {csvData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Preview (first 5 movies)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="text-[10px] w-full">
                  <thead>
                    <tr>
                      {csvHeaders.slice(0, 8).map((h, i) => (
                        <th key={i} className="px-1.5 py-1 text-left whitespace-nowrap font-medium text-muted-foreground">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t border-border/30">
                        {csvHeaders.slice(0, 8).map((h, j) => (
                          <td key={j} className="px-1.5 py-1 whitespace-nowrap max-w-[100px] truncate">
                            {row[h] || <span className="text-muted-foreground/20">—</span>}
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
              <>Import {csvData.length} Movies for {importYear}</>
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
            <CardContent className="p-4">
              {importResult.failed === 0 ? (
                <div className="flex flex-col items-center gap-2 text-center">
                  <Check className="h-8 w-8 text-green-500" />
                  <p className="font-medium">
                    Imported {importResult.success} movies!
                  </p>
                  {importResult.skipped > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {importResult.skipped} rows skipped (no title/date)
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-center">
                  <AlertCircle className="h-8 w-8 text-yellow-500" />
                  <p className="font-medium">
                    Imported {importResult.success}, failed {importResult.failed}
                    {importResult.skipped > 0 && `, skipped ${importResult.skipped}`}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Import Log */}
        {importLog.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Import Log</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {importLog.map((entry, i) => (
                  <p
                    key={i}
                    className={cn(
                      "text-xs font-mono",
                      entry.includes("Failed") || entry.includes("Error")
                        ? "text-red-400"
                        : entry.includes("⚠")
                        ? "text-yellow-400"
                        : entry.includes("Skipped")
                        ? "text-muted-foreground/50"
                        : "text-green-400"
                    )}
                  >
                    {entry}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
