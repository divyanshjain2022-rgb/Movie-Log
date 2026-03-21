import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const GOOGLE_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;

// Comprehensive system instruction for PVR/INOX/Cinepolis tickets
const systemInstruction = `
You are a specialized data extraction engine for Indian movie tickets (PVR, INOX, Cinepolis).
Extract ALL data accurately from booking confirmations and tax invoices.

CRITICAL RULES:

1. **Movie Title**:
   - Clean title: Remove format tags (IMAX, 3D, 4DX), language (Hindi, English), certifications (UA, A).
   - "ZOOTOPIA 2 (3D ENGLISH IMAX WITH" -> "ZOOTOPIA 2"

2. **Theater**: Full name with mall ("LUCKNOW PHOENIX PALASSIO" -> "Phoenix Palassio Lucknow")

3. **Date**: Strictly YYYY-MM-DD. If "Fri, 28 Nov 2025" -> "2025-11-28"

4. **Showtime**: Extract as "HH:MM AM/PM" (e.g., "04:00 PM")

5. **Screen/Audi**: "SCREEN 4" or "Audi 3"

6. **Seat**: "A-14" or "G-12, G-13"

7. **Format**: List all found: ["IMAX", "3D"] or ["2D"]

8. **Booking ID**: Alphanumeric code (e.g., "TMAZJS3", "5175EA296196")

9. **CRITICAL PRICING (Blue Receipt Logic)**:
   For receipts with itemized breakdown:
   - **admin_base**: "Admin" amount (e.g., ₹270.34) - this is the BASE ticket price
   - **service_charge**: "Service Charge" or "Internet Handling Fee" (e.g., ₹9.32)
   - **format_charge**: "3D Charge" or "IMAX Charge" (e.g., ₹59.32) - format surcharge
   - **cgst**: "CGST" amount (e.g., ₹30.51)
   - **sgst**: "SGST" amount (e.g., ₹30.51)
   - **amount_paid**: "AMOUNT PAID" (e.g., ₹400.00)

   For simpler receipts:
   - **ticket_total**: Look for "Total Ticket Price" or line ending in .00
   - **convenience_fee**: "Convenience Fee" + any taxes listed below it
   - **grand_total**: Final "Total" or "Amount Paid"

10. **Ticket Price Hint**: Base ticket prices (without fees) ALWAYS end with .00
`;

// JSON Schema for structured output
const responseSchema = {
  type: "OBJECT",
  properties: {
    movie_title: { type: "STRING", description: "Cleaned movie title" },
    theater_name: { type: "STRING", description: "Full cinema name with location" },
    show_date: { type: "STRING", description: "YYYY-MM-DD" },
    show_time: { type: "STRING", description: "HH:MM AM/PM" },
    audi: { type: "STRING", description: "Screen/Audi number" },
    seat_number: { type: "STRING", description: "Seat(s)" },
    formats: { type: "ARRAY", items: { type: "STRING" }, description: "Format tags" },
    booking_id: { type: "STRING", description: "Booking ID" },
    pricing: {
      type: "OBJECT",
      properties: {
        admin_base: { type: "NUMBER", description: "Admin/Base ticket price" },
        format_charge: { type: "NUMBER", description: "3D/IMAX surcharge" },
        service_charge: { type: "NUMBER", description: "Convenience/Internet fee before tax" },
        cgst: { type: "NUMBER", description: "CGST amount" },
        sgst: { type: "NUMBER", description: "SGST amount" },
        amount_paid: { type: "NUMBER", description: "Total amount paid" },
        // Fallback fields for simpler receipts
        ticket_total: { type: "NUMBER", description: "Total ticket price (if no breakdown)" },
        convenience_fee_total: { type: "NUMBER", description: "Total convenience fee with tax" },
        grand_total: { type: "NUMBER", description: "Final total" }
      }
    }
  }
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

// Detect MIME type from base64 data URI or raw base64
function detectMimeType(imageData: string, providedMime?: string): string {
  // Check for data URI prefix
  const dataUriMatch = imageData.match(/^data:([^;]+);base64,/);
  if (dataUriMatch) {
    return dataUriMatch[1];
  }

  // Use provided mime type if available
  if (providedMime) {
    return providedMime;
  }

  // Try to detect from base64 magic bytes
  // Decode first few bytes
  try {
    const raw = atob(imageData.substring(0, 16));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i);
    }

    // JPEG: FF D8 FF
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      return "image/jpeg";
    }
    // PNG: 89 50 4E 47
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      return "image/png";
    }
    // PDF: 25 50 44 46 (%PDF)
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return "application/pdf";
    }
    // WebP: 52 49 46 46 (RIFF)
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      return "image/webp";
    }
    // HEIC/HEIF: check for ftyp box
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      return "image/heic";
    }
  } catch {
    // Fall through to default
  }

  return "image/jpeg"; // Default fallback
}

// Strip data URI prefix if present, return raw base64
function stripDataUri(data: string): string {
  const commaIndex = data.indexOf(",");
  if (commaIndex !== -1 && data.substring(0, commaIndex).includes("base64")) {
    return data.substring(commaIndex + 1);
  }
  return data;
}

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

    // Detect mime type BEFORE stripping the data URI
    const mimeType = detectMimeType(body.image, body.mimeType);
    const base64Data = stripDataUri(body.image);

    const sizeInBytes = Math.ceil(base64Data.length / 4) * 3;
    console.log(`[OCR] Image size: ${(sizeInBytes / 1024 / 1024).toFixed(2)} MB, MIME: ${mimeType}`);

    const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

    const usedModel = "gemini-2.5-pro";
    console.log(`[OCR] Using model: ${usedModel}`);

    let response;
    try {
      response = await ai.models.generateContent({
        model: usedModel,
        config: {
          systemInstruction: systemInstruction,
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
              { text: "Extract ALL ticket details including itemized pricing breakdown." },
            ],
          },
        ],
      });
    } catch (apiError: any) {
      console.error("[OCR] Gemini API error:", apiError?.message, apiError?.status, JSON.stringify(apiError?.errorDetails || {}));
      throw new Error(`Gemini API error: ${apiError?.message || "Unknown"}`);
    }

    const textResponse = response.text;
    if (!textResponse) {
      throw new Error("Empty response from AI model");
    }

    console.log("[OCR] Raw response:", textResponse.substring(0, 600));

    let geminiData: any;
    try {
      const jsonStr = textResponse.replace(/```json/g, "").replace(/```/g, "").trim();
      geminiData = JSON.parse(jsonStr);
    } catch (e) {
      console.error("[OCR] JSON Parse Error", e);
      throw new Error("Failed to parse Gemini JSON response");
    }

    console.log("[OCR] Parsed:", JSON.stringify(geminiData, null, 2));

    // Calculate ticket_cost and convenience_fee from the detailed breakdown
    let ticket_cost: number | null = null;
    let convenience_fee: number | null = null;
    const p = geminiData.pricing || {};

    // Blue receipt logic: Admin + Format Charge = Ticket Cost
    if (p.admin_base) {
      ticket_cost = (p.admin_base || 0) + (p.format_charge || 0);
      // Convenience fee = Service Charge + GST
      convenience_fee = (p.service_charge || 0) + (p.cgst || 0) + (p.sgst || 0);
    }
    // Fallback for simpler receipts
    else if (p.ticket_total) {
      ticket_cost = p.ticket_total;
      convenience_fee = p.convenience_fee_total || 0;
    }
    // Last resort: Calculate from grand_total
    else if (p.amount_paid || p.grand_total) {
      const total = p.amount_paid || p.grand_total || 0;
      convenience_fee = (p.service_charge || 0) + (p.cgst || 0) + (p.sgst || 0);
      ticket_cost = total - (convenience_fee || 0);
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
