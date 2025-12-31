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
}

export async function POST(request: NextRequest) {
  try {
    // 1. Config Check
    if (!GOOGLE_API_KEY) {
      console.error("OCR Check Failed: GOOGLE_CLOUD_API_KEY is missing");
      return NextResponse.json(
        { error: "Server configuration error: OCR API key is missing. Please check Vercel env vars." },
        { status: 500 }
      );
    }

    // 2. Request Parsing Check
    let body;
    try {
      body = await request.json();
    } catch (e) {
      console.error("OCR Body Parse Failed:", e);
      return NextResponse.json(
        { error: "Invalid request format: Body must be JSON" },
        { status: 400 }
      );
    }

    if (!body || !body.image) {
      console.error("OCR Validation Failed: No image provided");
      return NextResponse.json(
        { error: "No image data provided in request" },
        { status: 400 }
      );
    }

    // 3. Google API Call
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
        { error: "No text text detected in this image. Please ensure image is clear and contains text." },
        { status: 422 } // Unprocessable Entity
      );
    }

    // 4. Parsing Logic
    const fullText = textAnnotations[0].description || "";
    console.log("OCR Success. Extracted chars:", fullText.length);

    try {
      const ticketData = parseTicketText(fullText);
      return NextResponse.json(ticketData);
    } catch (parseError) {
      console.error("OCR Parsing Logic Failed:", parseError);
      return NextResponse.json(
        { error: "Failed to parse ticket data from extracted text." },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error("OCR Critical Failure:", error);
    return NextResponse.json(
      { error: "Internal Server Error during OCR processing." },
      { status: 500 }
    );
  }
}

function parseTicketText(text: string): TicketData {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const fullText = text.toLowerCase();
  const originalText = text;

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

  // === MOVIE TITLE ===
  const moviePatterns = [
    /([A-Z][A-Z0-9\s]+(?:\d)?)\s*\((?:\d*D?\s*)?[A-Z]+/,
    /(?:movie|film|title)[:\s]*([^\n]+)/i,
  ];

  for (const pattern of moviePatterns) {
    const match = originalText.match(pattern);
    if (match) {
      let title = match[1].trim();
      title = title.replace(/\s*\(.*$/, "").trim();
      if (title.length > 2 && title.length < 100) {
        result.movie_title = title;
        break;
      }
    }
  }

  if (!result.movie_title) {
    for (const line of lines) {
      if (line === line.toUpperCase() &&
        line.length > 3 &&
        line.length < 60 &&
        !line.includes("PVR") &&
        !line.includes("INOX") &&
        !line.includes("SCREEN") &&
        !line.includes("SEAT") &&
        !line.includes("BOOKING")) {
        result.movie_title = line.replace(/\s*\(.*$/, "").trim();
        break;
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
      result.showtime = normalizeTime(match[0]);
      if (result.showtime) break;
    }
  }

  // === THEATER ===
  const theaterPatterns = [
    /inox\s+(?:megaplex\s+)?([^\n,]+(?:mall|cinema)?[^\n,]*)/i,
    /pvr\s+([^\n,]+(?:mall|cinema)?[^\n,]*)/i,
    /(phoenix\s+pallass?io[^\n,]*)/i,
    /(cinepolis[^\n,]*)/i,
  ];

  for (const pattern of theaterPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.theater = match[0].trim().replace(/\s+/g, " ");
      break;
    }
  }

  // === SCREEN/AUDI ===
  const screenMatch = text.match(/screen\s*(\d+)/i);
  if (screenMatch) {
    result.audi = `Screen ${screenMatch[1]}`;
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
    /(?:amount\s*paid|total\s*ticket\s*price|total)[:\s]*[₹rs\.?\s]*([\d,]+(?:\.\d{2})?)/i,
    /[₹]\s*([\d,]+(?:\.\d{2})?)/,
  ];

  for (const pattern of ticketCostPatterns) {
    const match = text.match(pattern);
    if (match) {
      const cost = parseFloat(match[1].replace(/,/g, ""));
      if (cost > 50 && cost < 10000) {
        result.ticket_cost = cost;
        break;
      }
    }
  }

  const convFeeMatch = text.match(/convenience\s*(?:fee|fees)?[:\s]*[₹rs\.?\s]*([\d,]+(?:\.\d{2})?)/i);
  if (convFeeMatch) {
    result.convenience_fee = parseFloat(convFeeMatch[1].replace(/,/g, ""));
  }

  // === BOOKING ID ===
  const bookingPatterns = [
    /(?:booking\s*(?:id|no)?|ticket\s*id)[:\s]*([A-Z0-9]+)/i,
    /\(ticketid[:\s]*([A-Z0-9]+)\)/i,
  ];

  for (const pattern of bookingPatterns) {
    const match = text.match(pattern);
    if (match && match[1].length >= 5 && match[1].length <= 20) {
      result.booking_id = match[1].toUpperCase();
      break;
    }
  }

  return result;
}

function normalizeDate(dateStr: string): string | null {
  try {
    const months: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
    };

    const monthNameMatch = dateStr.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?\s*(\d{4})?/i);
    if (monthNameMatch) {
      const day = monthNameMatch[1].padStart(2, "0");
      const month = months[monthNameMatch[2].toLowerCase().substring(0, 3)];
      const year = monthNameMatch[3] || new Date().getFullYear().toString();
      return `${year}-${month}-${day}`;
    }

    const numericMatch = dateStr.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);
    if (numericMatch) {
      const day = numericMatch[1].padStart(2, "0");
      const month = numericMatch[2].padStart(2, "0");
      let year = numericMatch[3];
      if (year.length === 2) {
        year = `20${year}`;
      }
      return `${year}-${month}-${day}`;
    }

    return null;
  } catch {
    return null;
  }
}

function normalizeTime(timeStr: string): string | null {
  try {
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);

    if (match) {
      let hours = parseInt(match[1]);
      const minutes = match[2];
      const period = match[3]?.toUpperCase();

      if (period === "PM" && hours < 12) hours += 12;
      if (period === "AM" && hours === 12) hours = 0;

      return `${hours.toString().padStart(2, "0")}:${minutes}`;
    }
    return null;
  } catch {
    return null;
  }
}
