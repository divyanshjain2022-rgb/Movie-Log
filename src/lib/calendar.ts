import { createHash } from "node:crypto";
import { minutesFromTime } from "@/lib/telegram";

// The feed URL's secret, derived from CRON_SECRET so there is nothing extra to
// configure. Rotating CRON_SECRET changes the URL and ends old subscriptions.
export function calendarToken(): string | null {
  const secret = process.env.CRON_SECRET;
  return secret ? createHash("sha256").update(`calendar-feed:${secret}`).digest("hex").slice(0, 32) : null;
}

export interface CalendarMovie {
  id: string;
  title: string;
  date: string;
  showtime: string | null;
  runtime_minutes: number | null;
  audi: string | null;
  seat: string | null;
  rating: number | null;
  theater: { name: string } | null;
  format: { name: string } | null;
}

const IST_OFFSET_MINUTES = 330;
const encoder = new TextEncoder();

function text(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// RFC 5545: lines of at most 75 octets, continued on lines starting with a space.
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > 75) {
      parts.push(current);
      current = " ";
      size = 1;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n");
}

const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const day = (date: string) => date.replace(/-/g, "");

export function buildCalendar(movies: CalendarMovie[], siteUrl: string, now = Date.now()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CinemaLog//Movie log//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:CinemaLog",
    "X-WR-TIMEZONE:Asia/Kolkata",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const movie of movies) {
    const [y, m, d] = movie.date.split("-").map(Number);
    const start = minutesFromTime(movie.showtime);
    const audi = movie.audi && (/^\d+$/.test(movie.audi) ? `Audi ${movie.audi}` : movie.audi);
    const details = [audi, movie.seat && `Seat ${movie.seat}`, movie.format?.name].filter(Boolean).join(" · ");
    const link = `${siteUrl}/movies/${movie.id}`;
    const description = [details, movie.rating ? `Your rating: ${movie.rating}/10` : "", link].filter(Boolean).join("\n");

    lines.push("BEGIN:VEVENT", `UID:${movie.id}@cinemalog`, `DTSTAMP:${utc(now)}`);
    if (start === null) {
      lines.push(`DTSTART;VALUE=DATE:${day(movie.date)}`, `DTEND;VALUE=DATE:${utc(Date.UTC(y, m - 1, d + 1)).slice(0, 8)}`);
    } else {
      // Showtimes are IST; runtime plus 20 minutes of ads and trailers, as the bot assumes.
      const startMs = Date.UTC(y, m - 1, d) + (start - IST_OFFSET_MINUTES) * 60_000;
      const minutes = movie.runtime_minutes ? movie.runtime_minutes + 20 : 180;
      lines.push(`DTSTART:${utc(startMs)}`, `DTEND:${utc(startMs + minutes * 60_000)}`);
    }
    lines.push(`SUMMARY:${text(movie.title)}`);
    if (movie.theater?.name) lines.push(`LOCATION:${text(movie.theater.name)}`);
    lines.push(`DESCRIPTION:${text(description)}`, `URL:${link}`, "END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
