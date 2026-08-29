import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const GOOGLE_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;

const EXTRACTION_PROMPT = `You are an expert OCR system for Indian movie theater tickets and booking confirmations.

Read ALL text in the image carefully, then extract the fields below.

THERE ARE TWO COMMON TICKET FORMATS:

=== FORMAT 1: PVR INOX TAX INVOICE (Blue ticket PDF) ===
This has a TWO-PANEL layout:
- LEFT PANEL (blue background): Movie title, theater name (e.g. "LUCKNOW PHOENIX PALASSIO"), TicketId, pricing breakdown (Admin, Service Charge, 3D Charge, CGST, SGST, AMOUNT PAID), a DD-MM-YY date, and a HH:MM:SS TRANSACTION timestamp (this is NOT the showtime!)
- RIGHT PANEL (white background): SCREEN number, CLASS, SEAT, a full date like "Wed, 25 Feb 2026", and the SHOWTIME in large colored text like "04:20 PM" or "10:35 AM"

CRITICAL: The showtime is the large colored time in the RIGHT panel (e.g. "04:20 PM"). Do NOT use the left panel timestamp (e.g. "03:16:54") — that is the booking/transaction time.

=== FORMAT 2: BOOKING CONFIRMATION SCREENSHOT (PVR INOX app / BookMyShow) ===
- Shows "SHOW DATE & TIME" with date and time range like "Tue, 17 Mar, 6:25 PM - 8:34 PM"
- The showtime is the START time (e.g. "6:25 PM")
- Shows AUDI number, seat, Booking ID, pricing breakdown

=== FORMAT 3: SMS / RCS CONFIRMATION SCREENSHOT (PVRINOX Cinemas chat message) ===
A screenshot of a phone messaging app showing a text from "PVRINOX Cinemas" like:
"Dear Patron, your ticket has been generated for MINIONS AND MONSTERS (3D ENGLISH IMAX WITH ENGLISH SUBTITLE) (UA 7) on Tuesday,21:20, (24 Hours Format), at POS:LUCKNOW PHOENIX PALASSIO (AUDI -AUDI SCREEN 4), 1 Seat(s): G:15. Total Amount-Rs 250,Transaction ID: 2858602."
- The screenshot may contain multiple messages (feedback requests, older tickets). Use ONLY the most recent "your ticket has been generated" message.
- MOVIE TITLE: the ALL-CAPS name after "generated for", cleaned of parenthetical tags → "Minions And Monsters"
- SHOWTIME: given in 24-hour format after the weekday, e.g. "Tuesday,21:20" → keep as "21:20"
- DATE: the message text only names a weekday. Use the chat's date separator bubble above the message (e.g. "7 July 2026" → "2026-07-07"). If no date separator is visible, return null — do NOT guess.
- THEATER: after "POS:", e.g. "POS:LUCKNOW PHOENIX PALASSIO" → "Phoenix Palassio Lucknow"
- AUDI: from "(AUDI -AUDI SCREEN 4)" → "4"
- SEAT: "1 Seat(s): G:15" → "G-15" (colon becomes hyphen; multiple seats comma-separated)
- PRICING: only a grand total is present: "Total Amount-Rs 250" → amount_paid = 250 (leave the breakdown fields as 0/null — there is no fee split in this format)
- BOOKING ID: the "Transaction ID" value, e.g. "2858602"

=== EXTRACTION RULES ===

MOVIE TITLE:
- Remove ALL parenthetical tags: format (IMAX, 3D, 4DX, MX4D, 2D), language (ENGLISH, HINDI, MANIPURI), certification (U, UA, A), "RE RELEASE", "WITH ENGLISH SUBTITLE", etc.
- "SINNERS (ENGLISH IMAX WITH ENGLI..." → "Sinners"
- "HOPPERS (3D ENGLISH IMAX WITH E..." → "Hoppers"
- "CRIME 101 (ENGLISH MX4D WITH ENG..." → "Crime 101"
- "DHURANDHAR THE REVENGE (HINDI)" → "Dhurandhar The Revenge"
- "BOONG (RE RELEASE) (MANIPURI WITH ENGLISH SUBTITLE) (U)" → "Boong"
- Return in title case

THEATER:
- From the ticket location line: "LUCKNOW PHOENIX PALASSIO" → "Phoenix Palassio Lucknow"
- Or from header: "3rd Floor Phoenix Pallasio Mall... Lucknow" → "Phoenix Palassio Lucknow"
- Or from booking: "PVR SUPERPLEX Lulu Lucknow" → "PVR Superplex Lulu Lucknow"

DATE: Return strictly as YYYY-MM-DD
- On PVR INOX tax invoices, use the FULL date from the RIGHT panel: "Wed, 25 Feb 2026" → "2026-02-25"
- Do NOT use the DD-MM-YY from left panel (that's the invoice date, same day but use the full format)
- On booking screenshots: "Tue, 17 Mar" with context year → "2026-03-17"

SHOWTIME — THIS IS THE MOST IMPORTANT FIELD:
- On PVR INOX tax invoices: Read the LARGE COLORED TIME in the RIGHT panel. Examples: "04:20 PM", "02:45 PM", "07:55 PM", "05:25 PM", "10:35 AM"
- IGNORE the left panel timestamp like "03:16:54" or "14:58:04" — that is the transaction time
- On booking screenshots: Use the start time from "6:25 PM - 8:34 PM"
- On SMS confirmations the time is already 24-hour: "Tuesday,21:20" → "21:20"
- Return strictly as 24-hour "HH:MM": "04:20 PM" → "16:20", "10:35 AM" → "10:35", "6:25 PM" → "18:25"
- NEVER return null — there is always a showtime on a valid ticket.

SCREEN/AUDI: Just the number
- "SCREEN 4" → "4", "SCREEN 7" → "7", "AUDI 09" → "9"

SEAT: Full seat designation
- "A-14" → "A-14", "B-11" → "B-11", "K9" → "K-9"

FORMAT: Extract from the movie title line (before you clean it)
- "ENGLISH IMAX WITH..." → ["IMAX", "2D"] (IMAX defaults to 2D unless 3D is specified)
- "3D ENGLISH IMAX WITH..." → ["IMAX", "3D"]
- "ENGLISH MX4D WITH..." → ["MX4D"]
- "(HINDI)" with no format tag → ["2D"]
- Also check if "3D Charge" in pricing is > 0 → format includes "3D"

BOOKING ID:
- On tax invoices: Look for "TicketId:" in the blue panel, e.g. "TicketId:T7A3E3S" → "T7A3E3S"
- On booking screenshots: "BOOKING ID:" field, e.g. "TTAYJUH"

PRICING (read every ₹ amount carefully):
For PVR INOX tax invoices:
  - "Admin" → admin_base (e.g. ₹191.73)
  - "Service Charge" → service_charge (e.g. ₹9.32)
  - "3D Charge" → format_charge (e.g. ₹59.32, or ₹0.00)
  - "CGST @9%" or "CGST @2.5%" → cgst
  - "SGST @9%" or "SGST @2.5%" → sgst
  - "AMOUNT PAID" → amount_paid (e.g. ₹237.25)

For booking screenshots:
  - "Net Price" or "Total Ticket Price" → ticket_total
  - "Convenience Fees" → convenience_fee_total
  - "Total" → grand_total

Return valid JSON. Use null for truly missing fields. Use 0 for pricing fields that show ₹0.00.`;

const responseSchema = {
  type: "OBJECT" as const,
  properties: {
    movie_title: { type: "STRING" as const, description: "Cleaned movie title without format/language/certification tags", nullable: true },
    theater_name: { type: "STRING" as const, description: "Full cinema name with location in title case", nullable: true },
    show_date: { type: "STRING" as const, description: "Date in YYYY-MM-DD format", nullable: true },
    show_time: { type: "STRING" as const, description: "Showtime in 24-hour HH:MM format", nullable: true },
    audi: { type: "STRING" as const, description: "Screen/Audi number only", nullable: true },
    seat_number: { type: "STRING" as const, description: "Seat designation(s)", nullable: true },
    formats: { type: "ARRAY" as const, items: { type: "STRING" as const }, description: "Screening format tags like IMAX, 3D, 2D, 4DX" },
    booking_id: { type: "STRING" as const, description: "Booking/transaction reference ID", nullable: true },
    pricing: {
      type: "OBJECT" as const,
      properties: {
        admin_base: { type: "NUMBER" as const, description: "Base admission/ticket price before surcharges" },
        format_charge: { type: "NUMBER" as const, description: "3D/IMAX/4DX format surcharge" },
        service_charge: { type: "NUMBER" as const, description: "Internet handling / convenience fee before tax" },
        cgst: { type: "NUMBER" as const, description: "CGST tax amount" },
        sgst: { type: "NUMBER" as const, description: "SGST tax amount" },
        amount_paid: { type: "NUMBER" as const, description: "Final total amount paid" },
        ticket_total: { type: "NUMBER" as const, description: "Total ticket price (simple receipts)" },
        convenience_fee_total: { type: "NUMBER" as const, description: "Total convenience fee including tax" },
        grand_total: { type: "NUMBER" as const, description: "Grand total / amount paid" },
      },
    },
  },
};

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

function detectMimeType(imageData: string, providedMime?: string): string {
  const dataUriMatch = imageData.match(/^data:([^;]+);base64,/);
  if (dataUriMatch) return dataUriMatch[1];
  if (providedMime) return providedMime;

  try {
    const raw = atob(imageData.substring(0, 16));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return "image/webp";
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "image/heic";
  } catch {
    // Fall through
  }

  return "image/jpeg";
}

function stripDataUri(data: string): string {
  const commaIndex = data.indexOf(",");
  if (commaIndex !== -1 && data.substring(0, commaIndex).includes("base64")) {
    return data.substring(commaIndex + 1);
  }
  return data;
}

// Edge Runtime: 30s timeout on Hobby (vs 10s for Node.js serverless)
export const runtime = "edge";

const MODEL_PRIORITY = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
];

export async function POST(request: NextRequest) {
  const timestamp = new Date().toISOString();
  console.log(`[OCR] Request received at ${timestamp}`);

  try {
    const body = await request.json();

    if (!body.image) {
      return NextResponse.json({ error: "No image data provided" }, { status: 400 });
    }

    if (!GOOGLE_API_KEY) {
      return NextResponse.json({ error: "Server misconfiguration: Missing API Key" }, { status: 500 });
    }

    const mimeType = detectMimeType(body.image, body.mimeType);
    const base64Data = stripDataUri(body.image);

    const sizeInBytes = Math.ceil(base64Data.length / 4) * 3;
    console.log(`[OCR] Image size: ${(sizeInBytes / 1024 / 1024).toFixed(2)} MB, MIME: ${mimeType}`);

    const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

    let response;
    let usedModel = "";

    for (const model of MODEL_PRIORITY) {
      try {
        console.log(`[OCR] Trying model: ${model}`);
        response = await ai.models.generateContent({
          model,
          config: {
            systemInstruction: EXTRACTION_PROMPT,
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            // OCR extraction doesn't need deep reasoning; LOW keeps latency
            // well under the 28s client abort / 30s Edge limit
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data,
                  },
                },
                {
                  text: "Read every piece of text in this ticket image carefully. Extract all fields according to the instructions. Pay special attention to pricing — read each line item and amount precisely.",
                },
              ],
            },
          ],
        });
        usedModel = model;
        break; // Success — stop trying other models
      } catch (apiError: any) {
        const status = apiError?.status || apiError?.httpStatusCode;
        const message = apiError?.message || "";
        console.error(`[OCR] ${model} failed:`, status, message.substring(0, 200));

        // Only retry on quota/rate limit errors (429) or unavailable (503)
        if (status === 429 || status === 503 || message.includes("quota") || message.includes("RESOURCE_EXHAUSTED")) {
          console.log(`[OCR] ${model} quota/rate limited, trying next model...`);
          continue;
        }
        // For other errors, don't retry
        throw new Error(`Gemini API error: ${message || "Unknown"}`);
      }
    }

    if (!response) {
      throw new Error("All Gemini models failed (quota exhausted). Try again later.");
    }

    const textResponse = response.text;
    if (!textResponse) {
      throw new Error("Empty response from AI model");
    }

    console.log(`[OCR] Model used: ${usedModel}`);
    console.log("[OCR] Raw response:", textResponse.substring(0, 800));

    let geminiData: any;
    try {
      const jsonStr = textResponse.replace(/```json/g, "").replace(/```/g, "").trim();
      geminiData = JSON.parse(jsonStr);
    } catch (e) {
      console.error("[OCR] JSON Parse Error:", e);
      throw new Error("Failed to parse response as JSON");
    }

    console.log("[OCR] Parsed:", JSON.stringify(geminiData, null, 2));
    console.log("[OCR] show_time field:", JSON.stringify(geminiData.show_time), "| Type:", typeof geminiData.show_time);

    // Calculate ticket_cost and convenience_fee from the breakdown
    let ticket_cost: number | null = null;
    let convenience_fee: number | null = null;
    const p = geminiData.pricing || {};

    // Type A: Itemized tax invoice
    if (p.admin_base && p.admin_base > 0) {
      ticket_cost = (p.admin_base || 0) + (p.format_charge || 0);
      convenience_fee = (p.service_charge || 0) + (p.cgst || 0) + (p.sgst || 0);
    }
    // Type B: Simple receipt with ticket_total
    else if (p.ticket_total && p.ticket_total > 0) {
      ticket_cost = p.ticket_total;
      convenience_fee = p.convenience_fee_total || 0;
    }
    // Type C: Only total available — use amount_paid or grand_total
    else if (p.amount_paid || p.grand_total) {
      const total = p.amount_paid || p.grand_total || 0;
      convenience_fee = (p.service_charge || 0) + (p.cgst || 0) + (p.sgst || 0) + (p.convenience_fee_total || 0);
      ticket_cost = total - (convenience_fee || 0);
      if (ticket_cost < 0) {
        ticket_cost = total;
        convenience_fee = 0;
      }
    }

    const ticketData: TicketData = {
      movie_title: geminiData.movie_title || null,
      date: geminiData.show_date || null,
      showtime: geminiData.show_time || null,
      theater: geminiData.theater_name || null,
      audi: geminiData.audi || null,
      format: geminiData.formats?.join(", ") || null,
      seat: geminiData.seat_number || null,
      ticket_cost,
      convenience_fee,
      booking_id: geminiData.booking_id || null,
    };

    console.log("[OCR] Final output:", JSON.stringify(ticketData, null, 2));

    return NextResponse.json(ticketData);
  } catch (error: any) {
    console.error("[OCR] Error:", error);
    return NextResponse.json(
      { error: `OCR Processing Failed: ${error.message || "Unknown error"}` },
      { status: 500 }
    );
  }
}
