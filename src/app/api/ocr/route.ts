import { NextRequest, NextResponse } from "next/server";
import { TicketOCRData } from "@/types";

const GOOGLE_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;
const VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.image) {
      return NextResponse.json({ error: "No image data provided" }, { status: 400 });
    }

    if (!GOOGLE_API_KEY) {
      console.error("OCR Check Failed: GOOGLE_CLOUD_API_KEY is missing");
      return NextResponse.json({ error: "Server misconfiguration: Missing API Key" }, { status: 500 });
    }

    // Call Google Vision API
    console.log("Calling Google Vision API...");
    const response = await fetch(`${VISION_API_URL}?key=${GOOGLE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: body.image },
            features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Google API Error (${response.status}):`, errorText);

      // Parse Google's error for display
      let errorDetail = response.statusText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.error?.message || errorText.substring(0, 200);
      } catch {
        errorDetail = errorText.substring(0, 200);
      }

      return NextResponse.json(
        { error: `OCR Error: ${errorDetail}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const textAnnotations = data.responses?.[0]?.textAnnotations;

    if (!textAnnotations || textAnnotations.length === 0) {
      console.warn("OCR Success but no text found");
      return NextResponse.json(
        { error: "Could not detect any text in the image. Try a clearer photo." },
        { status: 422 }
      );
    }

    const fullText = textAnnotations[0].description || "";
    console.log("Extracted text length:", fullText.length);

    // Parse the text (Async because it calls TMDB)
    const ticketData = await parseTicketText(fullText);

    console.log("Parsed ticket data:", JSON.stringify(ticketData));
    return NextResponse.json(ticketData);

  } catch (error) {
    console.error("OCR Critical Failure:", error);
    return NextResponse.json(
      { error: "Internal Server Error during OCR processing." },
      { status: 500 }
    );
  }
}

async function parseTicketText(text: string): Promise<TicketOCRData> {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const fullText = text.toLowerCase();

  // Debug logging
  console.log("--- OCR RAW TEXT START ---");
  console.log(text);
  console.log("--- OCR RAW TEXT END ---");

  const result: TicketOCRData = {
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

  // === MOVIE TITLE ===
  const moviePatterns = [
    // PVR INOX format: MOVIE NAME (3D ENGLISH IMAX WITH
    // Case-sensitive, strict
    /([A-Z][A-Z0-9\s]+\d?)\s*\((?:3D|2D|IMAX|ENGLISH|HINDI|TELUGU|TAMIL)/,
    // Standard patterns
    /(?:movie|film|title)[:\s]*([^\n]+)/i,
  ];

  for (const pattern of moviePatterns) {
    const match = text.match(pattern);
    if (match) {
      let title = match[1].trim();
      // Clean up specific PVR artifacts
      title = title.replace(/^Lucknow\s*\d+\s*/i, "");
      title = title.replace(/^(?:TAX\s*INVOICE|INVOICE|TICKET)\s*/i, "").trim();
      title = title.replace(/\s*\(.*$/, "").trim();

      if (title.length > 2 && title.length < 100) {
        result.movie_title = title;
        break;
      }
    }
  }

  // Fallback: look for uppercase lines that aren't headers
  if (!result.movie_title) {
    for (const line of lines) {
      if (line === line.toUpperCase() &&
        line.length > 3 &&
        line.length < 60 &&
        !line.match(/Lucknow|Phoenix|Pallasio|Road|Floor|Mall/i) &&
        !line.includes("PVR") &&
        !line.includes("INOX") &&
        !line.includes("SCREEN") &&
        !line.includes("SEAT") &&
        !line.includes("BOOKING") &&
        !line.includes("TAX") &&
        !line.includes("INVOICE") &&
        !line.includes("LIMITED") &&
        !line.includes("TERMS") &&
        !line.includes("CONDITIONS")) {

        let title = line.replace(/\s*\(.*$/, "").trim();
        title = title.replace(/^(?:TAX\s*INVOICE|INVOICE)\s*/i, "").trim();
        if (title.length > 2) {
          result.movie_title = title;
          break;
        }
      }
    }
  }

  // === DATE ===
  const datePatterns = [
    /(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s*(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?\s*(\d{4})?/i,
    /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?\s*(\d{4})/i,
    /(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      result.date = normalizeDate(match[0]);
      if (result.date) break;
    }
  }

  // === SHOWTIME ===
  const timePatterns = [
    /(\d{1,2}:\d{2})\s*(am|pm)/i,
    /(\d{1,2}:\d{2})/,
  ];

  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      result.showtime = match[0].toUpperCase();
      break;
    }
  }

  // === THEATER ===
  const theaterPatterns = [
    // Exclude "Thank you for choosing..."
    /pvr\s*inox\s*(?:limited)?[^\n]*?([^\n]*(?:mall|cinema|phoenix|pallasio)[^\n]*)/i,
    /(?:floor|rd|nd|st)\s+([^\n]*(?:mall|phoenix|pallasio)[^\n]*)/i,
    // Strict INOX match avoiding "PVR INOX!"
    /inox\s+(?:megaplex\s+)?([^\n,]+(?:mall|cinema)[^\n,]*)/i,
    /pvr\s+([^\n,]+(?:mall|cinema)[^\n,]*)/i,
    /(phoenix\s+pallass?io[^\n,]*)/i,
  ];

  for (const pattern of theaterPatterns) {
    const match = text.match(pattern);
    if (match) {
      let theater = (match[1] || match[0]).trim().replace(/\s+/g, " ");
      theater = theater.replace(/^\d+\s*/, "").trim();
      // Remove common address prefixes
      theater = theater.replace(/^(?:floor|ground|first|second|third|3rd)\s*/i, "");

      if (theater.length > 5 && !theater.toLowerCase().includes("thank you")) {
        result.theater = theater.replace(/,?\s*lucknow/i, "").trim();
        break;
      }
    }
  }
  // Fallback LUCKNOW
  if (!result.theater && fullText.includes("phoenix") && fullText.includes("pallasio")) {
    result.theater = "Phoenix Pallasio Mall";
  }

  // === FORMAT ===
  const formatPatterns = [
    { regex: /3d\s*(?:english\s*)?imax/i, format: "IMAX 3D" },
    { regex: /imax\s*3d/i, format: "IMAX 3D" },
    { regex: /imax\s*2d/i, format: "IMAX 2D" },
    { regex: /imax/i, format: "IMAX" },
    { regex: /4dx/i, format: "4DX" },
    { regex: /mx4d/i, format: "MX4D" },
    { regex: /dolby\s*atmos/i, format: "Dolby Atmos" },
    { regex: /\b3d\b/i, format: "3D" },
  ];

  for (const { regex, format } of formatPatterns) {
    if (regex.test(fullText)) {
      result.format = format;
      break;
    }
  }

  // === SEAT ===
  const seatPatterns = [
    /(?:seat|seats?)[:\s]*([A-Z]-?\d+)/i,
    /\b([A-Z]-?\d{1,2})\b(?!\s*(?:nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct))/i,
  ];
  for (const pattern of seatPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.seat = match[1].toUpperCase().replace("-", "");
      break;
    }
  }

  // === COSTS ===
  const ticketCostPatterns = [
    /total\s*ticket\s*price\s*(?:[:\-])?\s*[₹]?\s*([\d,]+\.\d{2})/i,
    /amount\s*paid\s*(?:[:\-])?\s*[₹]?\s*([\d,]+\.\d{2})/i,
    /total\s*(?:amount|paid)?\s*(?:[:\-])?\s*[₹]?\s*([\d,]+\.\d{2})/i,
  ];

  for (const pattern of ticketCostPatterns) {
    const match = text.match(pattern);
    if (match) {
      const cost = parseFloat(match[1].replace(/,/g, ""));
      if (cost >= 50 && cost < 50000) {
        result.ticket_cost = cost;
        break;
      }
    }
  }

  // === GRAND TOTAL ===
  // We extract Grand Total to calculate the full convenience fee (Fee + GST + Others)
  const totalPatterns = [
    /^Total\s*(?:[:\-])?\s*[₹]?\s*([\d,]+\.\d{2})/im, // Start of line "Total"
    /Total\s+Amount\s*(?:[:\-])?\s*[₹]?\s*([\d,]+\.\d{2})/i,
    /AMOUNT\s*PAID\s*(?:[:\-])?\s*[₹]?\s*([\d,]+\.\d{2})/i,
  ];
  let grandTotal: number | null = null;
  for (const pattern of totalPatterns) {
    const match = text.match(pattern);
    if (match) {
      grandTotal = parseFloat(match[1].replace(/,/g, ""));
      break;
    }
  }

  // === CONVENIENCE FEE ===
  // Primary method: Difference between Grand Total and Ticket Cost
  if (grandTotal && result.ticket_cost && grandTotal > result.ticket_cost) {
    result.convenience_fee = Number((grandTotal - result.ticket_cost).toFixed(2));
  } else {
    // Fallback: Explicit extraction
    const convFeePatterns = [
      /convenience\s*(?:fee|fees)\s*(?:[:\-])?\s*[₹]?\s*([\d,]+\.\d{2})/i,
    ];
    for (const pattern of convFeePatterns) {
      const match = text.match(pattern);
      if (match) {
        result.convenience_fee = parseFloat(match[1].replace(/,/g, ""));
        break;
      }
    }
  }

  // === BOOKING ID ===
  const bookingPatterns = [
    // Handle "Booking ID: \n CODE"
    /(?:booking\s*(?:id|no)?|ticket\s*id)[:\s]*([A-Z0-9]+)/i,
    /\b([A-Z0-9]{6,10})\b/,
  ];
  for (const pattern of bookingPatterns) {
    const match = text.match(pattern);
    if (match && match[1].length > 4) {
      // Must contain at least one digit and one letter
      if (/\d/.test(match[1]) && /[A-Z]/.test(match[1])) {
        result.booking_id = match[1];
        break;
      }
    }
  }

  // === TMDB ENRICHMENT ===
  if (result.movie_title && process.env.TMDB_API_KEY) {
    try {
      console.log(`Searching TMDB for: ${result.movie_title}`);
      const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(result.movie_title)}&year=${result.date ? new Date(result.date).getFullYear() : ""}`;

      const tmdbRes = await fetch(searchUrl);
      if (tmdbRes.ok) {
        const tmdbData = await tmdbRes.json();
        if (tmdbData.results && tmdbData.results.length > 0) {
          const bestMatch = tmdbData.results[0];
          console.log("TMDB Match Found:", bestMatch.title);

          result.tmdb_id = bestMatch.id;
          result.overview = bestMatch.overview;
          result.poster_path = bestMatch.poster_path;
          result.backdrop_path = bestMatch.backdrop_path;
          result.original_title = bestMatch.original_title;
          result.release_date = bestMatch.release_date;
        }
      }
    } catch (error) {
      console.error("TMDB Search Failed:", error);
    }
  }

  return result;
}

function normalizeDate(dateStr: string): string | null {
  try {
    const date = new Date(dateStr);
    return !isNaN(date.getTime()) ? date.toISOString().split("T")[0] : null;
  } catch {
    return null;
  }
}
