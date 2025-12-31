import { NextRequest, NextResponse } from "next/server";

// Google Cloud Vision API endpoint
const VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate";
const GOOGLE_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;

interface TicketData {
  movie_title: string | null;
  date: string | null;
  showtime: string | null;
  theater: string | null;
  audi: string | null;
  format: string | null;
  seat: string | null;
  ticket_cost: number | null;
  convenience_fee: number | null;
  booking_id: string | null;
  raw_text?: string; // For debugging
}

export async function POST(request: NextRequest) {
  try {
    if (!GOOGLE_API_KEY) {
      return NextResponse.json(
        { error: "GOOGLE_CLOUD_API_KEY not configured" },
        { status: 500 }
      );
    }

    const { image } = await request.json();

    if (!image) {
      return NextResponse.json(
        { error: "No image provided" },
        { status: 400 }
      );
    }

    // Call Google Cloud Vision API
    const response = await fetch(`${VISION_API_URL}?key=${GOOGLE_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: image, // base64 encoded image
            },
            features: [
              {
                type: "DOCUMENT_TEXT_DETECTION",
                maxResults: 1,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Google Vision API error:", error);
      return NextResponse.json(
        { error: "Failed to process image" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const textAnnotations = data.responses?.[0]?.textAnnotations;

    if (!textAnnotations || textAnnotations.length === 0) {
      return NextResponse.json(
        { error: "No text found in image" },
        { status: 400 }
      );
    }

    // Get the full text from the first annotation (contains all text)
    const fullText = textAnnotations[0].description || "";

    // Parse the extracted text to find ticket information
    const ticketData = parseTicketText(fullText);

    return NextResponse.json(ticketData);
  } catch (error) {
    console.error("OCR error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function parseTicketText(text: string): TicketData {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const fullTextLower = text.toLowerCase();

  const result: TicketData = {
    movie_title: null,
    date: null,
    showtime: null,
    theater: null,
    audi: null,
    format: null,
    seat: null,
    ticket_cost: null,
    convenience_fee: null,
    booking_id: null,
  };

  // Detect ticket provider for specialized parsing
  const isPVRINOX = /pvr|inox/i.test(text);
  const isCinepolis = /cinepolis/i.test(text);
  const isBookMyShow = /bookmyshow/i.test(text);

  // === MOVIE TITLE ===
  result.movie_title = extractMovieTitle(lines, text);

  // === FORMAT (extract before cleaning title) ===
  result.format = extractFormat(fullTextLower);

  // === DATE ===
  result.date = extractDate(text, lines);

  // === SHOWTIME ===
  result.showtime = extractShowtime(text, lines);

  // === THEATER ===
  result.theater = extractTheater(text, isPVRINOX, isCinepolis);

  // === SCREEN/AUDI ===
  result.audi = extractScreen(text);

  // === SEAT ===
  result.seat = extractSeat(text, lines);

  // === COSTS ===
  const costs = extractCosts(text);
  result.ticket_cost = costs.ticketCost;
  result.convenience_fee = costs.convenienceFee;

  // === BOOKING ID ===
  result.booking_id = extractBookingId(text);

  return result;
}

function extractMovieTitle(lines: string[], fullText: string): string | null {
  // PVR INOX Pattern 1: "MOVIE NAME (FORMAT INFO) (RATING)"
  // e.g., "ZOOTOPIA 2 (3D ENGLISH IMAX WITH ENGLISH SUBTITLE) (UA 7+)"
  const pvrPattern = /^([A-Z][A-Z0-9\s:'-]+?)(?:\s*\((?:\d*D?\s*)?[A-Z]|\s+UA\s|\s+[UAP]\/A)/m;
  const pvrMatch = fullText.match(pvrPattern);
  if (pvrMatch) {
    const title = cleanMovieTitle(pvrMatch[1]);
    if (isValidTitle(title)) return title;
  }

  // Pattern 2: Look for movie title on its own line (ALL CAPS, before format info)
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i];

    // Skip common non-title lines
    if (shouldSkipLine(line)) continue;

    // Check if line looks like a movie title
    // Movie titles are usually in CAPS, may contain numbers, spaces, colons
    if (/^[A-Z][A-Z0-9\s:'-]+\d*$/.test(line) && line.length >= 3 && line.length <= 50) {
      const title = cleanMovieTitle(line);
      if (isValidTitle(title)) return title;
    }

    // Also check for title with format info on same line
    const withFormat = line.match(/^([A-Z][A-Z0-9\s:'-]+?)(?:\s*\(|\s+\d+D|\s+IMAX)/);
    if (withFormat) {
      const title = cleanMovieTitle(withFormat[1]);
      if (isValidTitle(title)) return title;
    }
  }

  // Pattern 3: Find title before common keywords
  const beforeKeywords = fullText.match(/^([A-Z][A-Z0-9\s:'-]+?)(?=\s*(?:UA|English|Hindi|Tamil|Telugu|\(|IMAX|3D|2D))/m);
  if (beforeKeywords) {
    const title = cleanMovieTitle(beforeKeywords[1]);
    if (isValidTitle(title)) return title;
  }

  return null;
}

function cleanMovieTitle(title: string): string {
  return title
    .replace(/\s*\(.*$/, "") // Remove parenthetical info
    .replace(/\s+(?:3D|2D|IMAX|4DX|DOLBY|ATMOS).*$/i, "") // Remove format suffixes
    .replace(/\s+(?:UA|U\/A|U|A|S)(?:\s+\d+\+?)?$/i, "") // Remove rating suffixes
    .replace(/\s+$/g, "") // Trim trailing spaces
    .trim();
}

function isValidTitle(title: string): boolean {
  if (!title || title.length < 2 || title.length > 60) return false;

  // Reject if it's a common non-title phrase
  const invalidTitles = [
    "BOOKING", "SCREEN", "SEAT", "PVR", "INOX", "CINEPOLIS", "TOTAL",
    "AMOUNT", "PAID", "PRICE", "TAX", "GST", "FEE", "ENJOY", "SHOW",
    "DATE", "TIME", "THANK", "LIMITED", "MALL", "MULTIPLEX", "MEGAPLEX"
  ];

  const upperTitle = title.toUpperCase();
  return !invalidTitles.some(invalid => upperTitle === invalid || upperTitle.startsWith(invalid + " "));
}

function shouldSkipLine(line: string): boolean {
  const skipPatterns = [
    /^(booking|thank|enjoy|pvr|inox|cinepolis|screen|seat|total|amount|₹|rs\.?)/i,
    /^\d+[-\/]\d+/,  // Date patterns
    /^[A-Z]-?\d+$/,  // Seat patterns like A14
    /limited|mall|multiplex|cinema/i,
  ];
  return skipPatterns.some(p => p.test(line));
}

function extractFormat(text: string): string | null {
  // Order matters - check more specific formats first
  const formatPatterns = [
    { regex: /3d\s*(?:english\s*)?imax|imax\s*3d|imax\s*with\s*3d/i, format: "IMAX 3D" },
    { regex: /imax\s*(?:2d|with\s*laser)?/i, format: "IMAX" },
    { regex: /4dx\s*3d/i, format: "4DX 3D" },
    { regex: /4dx/i, format: "4DX" },
    { regex: /ice\s*3d/i, format: "ICE 3D" },
    { regex: /ice/i, format: "ICE" },
    { regex: /mx4d/i, format: "MX4D" },
    { regex: /screenx/i, format: "ScreenX" },
    { regex: /dolby\s*(?:cinema|atmos)/i, format: "Dolby Cinema" },
    { regex: /(?:^|\s)3d(?:\s|$|[^a-z])/i, format: "3D" },
    { regex: /gold\s*class/i, format: "Gold Class" },
    { regex: /director'?s?\s*cut/i, format: "Director's Cut" },
  ];

  for (const { regex, format } of formatPatterns) {
    if (regex.test(text)) {
      return format;
    }
  }

  return "Standard";
}

function extractDate(text: string, lines: string[]): string | null {
  // Pattern 1: "Fri, 28 Nov 2025" or "Fri, 28 Nov, 4:00 PM"
  const dayMonthYear = text.match(/(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*[,.]?\s*(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[,.]?\s*(?:(\d{4})|(?=\d{1,2}:\d{2}))/i);
  if (dayMonthYear) {
    return normalizeDate(dayMonthYear[1], dayMonthYear[2], dayMonthYear[3]);
  }

  // Pattern 2: "28 Nov 2025"
  const monthYear = text.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[,.]?\s*(\d{4})/i);
  if (monthYear) {
    return normalizeDate(monthYear[1], monthYear[2], monthYear[3]);
  }

  // Pattern 3: DD-MM-YY or DD-MM-YYYY (common in Indian tickets)
  const numericDate = text.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);
  if (numericDate) {
    let year = numericDate[3];
    if (year.length === 2) {
      year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
    }
    return `${year}-${numericDate[2].padStart(2, "0")}-${numericDate[1].padStart(2, "0")}`;
  }

  // Pattern 4: Look for "SHOW DATE" or similar labels
  for (const line of lines) {
    if (/show\s*date|date\s*&\s*time/i.test(line)) {
      const nextLineIdx = lines.indexOf(line) + 1;
      if (nextLineIdx < lines.length) {
        const dateMatch = lines[nextLineIdx].match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
        if (dateMatch) {
          return normalizeDate(dateMatch[1], dateMatch[2], null);
        }
      }
    }
  }

  return null;
}

function normalizeDate(day: string, month: string, year: string | null): string {
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
  };

  const y = year || new Date().getFullYear().toString();
  const m = months[month.toLowerCase().substring(0, 3)];
  const d = day.padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function extractShowtime(text: string, lines: string[]): string | null {
  // Pattern 1: Time with AM/PM - "4:00 PM" or "04:00 PM"
  const timeWithPeriod = text.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (timeWithPeriod) {
    return normalizeTime(timeWithPeriod[1], timeWithPeriod[2], timeWithPeriod[3]);
  }

  // Pattern 2: 24-hour format after specific labels
  for (const line of lines) {
    if (/show\s*time|time/i.test(line)) {
      const timeMatch = line.match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        return `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
      }
    }
  }

  // Pattern 3: Time range "4:00 PM - 6:28 PM" - take start time
  const timeRange = text.match(/(\d{1,2}):(\d{2})\s*(am|pm)\s*[-–]\s*\d{1,2}:\d{2}\s*(am|pm)/i);
  if (timeRange) {
    return normalizeTime(timeRange[1], timeRange[2], timeRange[3]);
  }

  return null;
}

function normalizeTime(hours: string, minutes: string, period: string): string {
  let h = parseInt(hours);
  const p = period.toUpperCase();

  if (p === "PM" && h < 12) h += 12;
  if (p === "AM" && h === 12) h = 0;

  return `${h.toString().padStart(2, "0")}:${minutes}`;
}

function extractTheater(text: string, isPVRINOX: boolean, isCinepolis: boolean): string | null {
  // PVR INOX specific patterns
  if (isPVRINOX) {
    // "INOX Megaplex Phoenix Palassio Mall Lucknow"
    const inoxPattern = text.match(/inox\s+(?:megaplex\s+)?([A-Za-z\s]+(?:mall|cinema|city)?[A-Za-z\s]*?)(?:\n|lucknow|delhi|mumbai|bangalore|hyderabad|chennai|kolkata|pune)/i);
    if (inoxPattern) {
      return `INOX ${inoxPattern[1].trim()}`;
    }

    // "LUCKNOW PHOENIX PALASSIO" pattern from e-ticket
    const locationPattern = text.match(/([A-Z]+)\s+(PHOENIX|FORUM|NEXUS|ORION|AMBIENCE|SELECT|DLF|ELANTE|VR|LULU)\s+([A-Z]+)/i);
    if (locationPattern) {
      return `PVR INOX ${locationPattern[2]} ${locationPattern[3]}, ${locationPattern[1]}`;
    }

    // Generic PVR/INOX
    const pvrGeneric = text.match(/(?:pvr|inox)[:\s]+([^\n]+?)(?:\n|$)/i);
    if (pvrGeneric) {
      return pvrGeneric[0].trim().replace(/\s+/g, " ");
    }
  }

  if (isCinepolis) {
    const cinepolisPattern = text.match(/cinepolis[:\s]+([^\n]+)/i);
    if (cinepolisPattern) {
      return cinepolisPattern[0].trim();
    }
  }

  // Generic theater detection - look for "Mall" or common theater names
  const genericTheater = text.match(/([A-Za-z\s]+(?:mall|cinema|multiplex|theatre|theater)[A-Za-z\s]*)/i);
  if (genericTheater) {
    return genericTheater[1].trim().replace(/\s+/g, " ");
  }

  return null;
}

function extractScreen(text: string): string | null {
  // "SCREEN 4" or "Screen 4" or "Audi 3"
  const screenMatch = text.match(/(?:screen|audi|hall|auditorium)\s*[:#]?\s*(\d+)/i);
  if (screenMatch) {
    return `Screen ${screenMatch[1]}`;
  }
  return null;
}

function extractSeat(text: string, lines: string[]): string | null {
  // Pattern 1: Explicit seat label - "SEAT: A14" or "Seats: A-14"
  const explicitSeat = text.match(/seats?\s*(?:info)?[:\s]+([A-Z]-?\d{1,2}(?:\s*,\s*[A-Z]-?\d{1,2})*)/i);
  if (explicitSeat) {
    return explicitSeat[1].toUpperCase().replace(/-/g, "").replace(/\s+/g, ", ");
  }

  // Pattern 2: Look for seat in context of "SEAT" label
  for (let i = 0; i < lines.length; i++) {
    if (/^seats?\s*(?:info)?$/i.test(lines[i]) && i + 1 < lines.length) {
      const seatMatch = lines[i + 1].match(/^([A-Z]-?\d{1,2})$/i);
      if (seatMatch) {
        return seatMatch[1].toUpperCase().replace(/-/g, "");
      }
    }
  }

  // Pattern 3: "CLASS: ROYAL SEAT: A-14" pattern from e-ticket
  const classSeat = text.match(/(?:class|category)[:\s]+[A-Z]+\s+seat[:\s]+([A-Z]-?\d{1,2})/i);
  if (classSeat) {
    return classSeat[1].toUpperCase().replace(/-/g, "");
  }

  // Pattern 4: Standalone seat pattern - be careful to exclude dates and other false positives
  // Look specifically for seat patterns in context
  const seatContext = text.match(/(?:royal|recliner|premium|gold|silver|classic)\s+([A-Z])-?(\d{1,2})/i);
  if (seatContext) {
    return `${seatContext[1].toUpperCase()}${seatContext[2]}`;
  }

  // Last resort: Find isolated seat pattern but verify it's not a date
  const isolatedSeat = text.match(/\b([A-Z])-?(\d{1,2})\b/);
  if (isolatedSeat) {
    const potential = `${isolatedSeat[1]}${isolatedSeat[2]}`;
    // Verify it's not part of a date or other pattern
    const context = text.substring(Math.max(0, text.indexOf(isolatedSeat[0]) - 20), text.indexOf(isolatedSeat[0]) + 20);
    if (!/nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|screen|audi/i.test(context)) {
      return potential.toUpperCase();
    }
  }

  return null;
}

function extractCosts(text: string): { ticketCost: number | null; convenienceFee: number | null } {
  let ticketCost: number | null = null;
  let convenienceFee: number | null = null;

  // Ticket cost patterns - prioritize "AMOUNT PAID" and "Total Ticket Price"
  const costPatterns = [
    /amount\s*paid[:\s]*[₹rs\.?\s]*([\d,]+(?:\.\d{2})?)/i,
    /total\s*ticket\s*price[:\s]*[₹rs\.?\s]*([\d,]+(?:\.\d{2})?)/i,
    /total[:\s]*[₹rs\.?\s]*([\d,]+(?:\.\d{2})?)/i,
    /net\s*(?:price|amount)[:\s]*[₹rs\.?\s]*([\d,]+(?:\.\d{2})?)/i,
  ];

  for (const pattern of costPatterns) {
    const match = text.match(pattern);
    if (match) {
      const cost = parseFloat(match[1].replace(/,/g, ""));
      // Reasonable ticket price range (INR 100 - 5000)
      if (cost >= 100 && cost <= 5000) {
        ticketCost = cost;
        break;
      }
    }
  }

  // If no labeled cost found, look for standalone amounts but be more careful
  if (!ticketCost) {
    // Find all rupee amounts
    const amounts = [...text.matchAll(/[₹]\s*([\d,]+(?:\.\d{2})?)/g)]
      .map(m => parseFloat(m[1].replace(/,/g, "")))
      .filter(a => a >= 100 && a <= 5000)
      .sort((a, b) => b - a); // Sort descending

    // Take the largest reasonable amount as ticket cost
    if (amounts.length > 0) {
      ticketCost = amounts[0];
    }
  }

  // Convenience fee
  const convFeeMatch = text.match(/convenience\s*(?:fee|fees)?[:\s]*[₹rs\.?\s]*([\d,]+(?:\.\d{2})?)/i);
  if (convFeeMatch) {
    convenienceFee = parseFloat(convFeeMatch[1].replace(/,/g, ""));
  }

  return { ticketCost, convenienceFee };
}

function extractBookingId(text: string): string | null {
  // Pattern 1: "Booking ID: TMAZJS3" or "BOOKING ID: TMAZJS3"
  const bookingIdMatch = text.match(/booking\s*(?:id|no\.?)?[:\s]+([A-Z0-9]{5,15})/i);
  if (bookingIdMatch) {
    return bookingIdMatch[1].toUpperCase();
  }

  // Pattern 2: "(TicketId:TMAZJS3)" - common in PVR INOX e-tickets
  const ticketIdMatch = text.match(/\(?ticket\s*id[:\s]*([A-Z0-9]{5,15})\)?/i);
  if (ticketIdMatch) {
    return ticketIdMatch[1].toUpperCase();
  }

  // Pattern 3: "Confirmation" or "Reference" number
  const confirmMatch = text.match(/(?:confirmation|reference|order)\s*(?:no\.?|id|#)?[:\s]+([A-Z0-9]{5,20})/i);
  if (confirmMatch) {
    return confirmMatch[1].toUpperCase();
  }

  return null;
}
