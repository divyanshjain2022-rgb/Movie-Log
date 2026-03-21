import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const GOOGLE_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;

const EXTRACTION_PROMPT = `You are an expert OCR system for Indian movie theater tickets and booking confirmations (PVR, INOX, Cinepolis, BookMyShow, Paytm).

Look at this ticket image carefully. First, read ALL text visible in the image. Then extract the following fields.

EXTRACTION RULES:

MOVIE TITLE:
- Remove format tags like "(IMAX)", "(3D)", "(4DX)", "(2D)", language tags like "(HINDI)", "(ENGLISH)", and certification tags like "(UA)", "(A)", "(U)"
- Example: "DEADPOOL & WOLVERINE (UA) (IMAX 2D) (ENGLISH)" → "Deadpool & Wolverine"
- Keep the core movie name in title case

THEATER:
- Full cinema name including mall/location
- "PVR: PHOENIX PALASSIO, LUCKNOW" → "PVR Phoenix Palassio Lucknow"
- "INOX: LULU MALL" → "INOX Lulu Mall"

DATE: Return strictly as YYYY-MM-DD
- "Fri, 28 Nov 2025" → "2025-11-28"
- "28/11/2025" → "2025-11-28"

SHOWTIME: Return as "HH:MM AM/PM" in 12-hour format
- "16:00" → "04:00 PM"
- "09:30 PM" → "09:30 PM"

SCREEN/AUDI: Just the number
- "SCREEN 4" → "4"
- "Audi 03" → "3"

SEAT: Full seat designation
- "G-12, G-13" → "G-12, G-13"

FORMAT: Identify the screening format from the ticket
- Look for: IMAX, 3D, 2D, 4DX, MX4D, PXL, Dolby Atmos, ScreenX, ICE
- If "IMAX 3D" → return ["IMAX", "3D"]
- If "4DX 3D" → return ["4DX", "3D"]
- If only "2D" or no format mentioned → return ["2D"]

BOOKING ID: The alphanumeric booking/transaction reference
- Usually labeled "Booking ID", "Transaction ID", "Booking Ref", or "PNR"

PRICING — This is critical, read every number carefully:

Type A - Itemized tax invoice (blue/white receipt):
  - "Admission/Admin" or base ticket amount → admin_base
  - "3D Charge" or "IMAX Charge" or format surcharge → format_charge
  - "Internet Handling Fee" or "Convenience Fee" or "Service Charge" (before tax) → service_charge
  - "CGST" → cgst
  - "SGST" → sgst
  - "Total" or "Amount Paid" or "Grand Total" → amount_paid

Type B - Simple booking confirmation:
  - "Ticket Price" or "Total Ticket" → ticket_total
  - "Convenience Fee" (including taxes) → convenience_fee_total
  - "Total Amount" or "Amount Paid" → grand_total

Type C - Screenshot with just total:
  - Whatever total amount is visible → grand_total

Return ONLY valid JSON matching the schema. Use null for fields you cannot find. Use 0 for pricing fields that don't apply. Do NOT guess — only extract what you can clearly read.`;

const responseSchema = {
  type: "OBJECT" as const,
  properties: {
    movie_title: { type: "STRING" as const, description: "Cleaned movie title without format/language/certification tags", nullable: true },
    theater_name: { type: "STRING" as const, description: "Full cinema name with location in title case", nullable: true },
    show_date: { type: "STRING" as const, description: "Date in YYYY-MM-DD format", nullable: true },
    show_time: { type: "STRING" as const, description: "Time in HH:MM AM/PM format", nullable: true },
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

// Try models in order of preference — skip to next on quota/rate limit errors
const MODEL_PRIORITY = [
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
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
