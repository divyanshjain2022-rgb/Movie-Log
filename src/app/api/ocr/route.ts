import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { TicketOCRData } from "@/types";

const GOOGLE_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;

// Comprehensive system instruction for PVR/INOX tickets
const systemInstruction = `
You are a specialized data extraction engine for Indian movie tickets (PVR, INOX, Cinepolis receipts).
Your job is to extract ALL data accurately from screenshots of booking confirmations and tax invoices.

CRITICAL EXTRACTION RULES:

1. **Movie Title Cleanup**: 
   - Extract the full title but REMOVE format tags (IMAX, 3D, 4DX, ICE), language (Hindi, English, Tamil, Telugu), and certifications (UA, UA 16+, A, U).
   - Example: "TRON: ARES (3D ENGLISH IMAX)" -> "TRON: ARES"
   - Example: "JOLLY LLB 3 (HINDI ATMOS)" -> "JOLLY LLB 3"
   - Example: "PUSHPA 2 THE RULE RELOADED VERSION (UA HINDI IMAX 2D)" -> "PUSHPA 2 THE RULE RELOADED VERSION"

2. **Theater Name**: 
   - Extract the FULL cinema name including the mall. 
   - Example: "INOX: Megaplex, Phoenix Palassio, Lko" -> "INOX Megaplex Phoenix Palassio Lucknow"
   - Example: "PVR: Phoenix Market City, Pune" -> "PVR Phoenix Market City Pune"
   - Remove "INOX:" or "PVR:" prefixes but keep the location.

3. **Showtime**:
   - Look for the time of the show carefully. It is usually near the date.
   - Format: "HH:MM AM/PM" (e.g., "10:00 AM", "07:30 PM")
   - Sometimes shown as "10:00 AM - 12:30 PM" (pick the START time).
   - If 24-hour format: convert to 12-hour with AM/PM.

4. **Date Parsing**: 
   - Convert ALL dates to strictly YYYY-MM-DD format.
   - If the receipt shows "Fri, 10 Oct" and no year, assume the year is 2026 (or the nearest future date). 
   - Look for explicit year mentions (e.g., "28 Nov 2025"). Use that if found.

5. **Screen/Audi**:
   - Look for "Audi", "Screen", "Hall" number.
   - Example: "Audi 3", "Screen 5", "Hall 2" -> extract as "Audi 3", "Screen 5", "Hall 2"

6. **Seat Number**:
   - Extract the seat identifier(s). 
   - Example: "G-12", "A14", "E-5,E-6" -> "G-12", "A14", "E-5, E-6"

7. **Formats**:
   - Look for these keywords in the movie title or elsewhere: IMAX, 3D, 4DX, ATMOS, ICE, PXL, 2D, Dolby, ScreenX
   - Return as a list: ["IMAX", "3D"] or ["4DX"] or ["2D"]

8. **Booking ID**:
   - Look for "Booking ID", "Confirmation Number", "Transaction ID", "PNR"
   - Usually an alphanumeric code like "TRAFCM4", "BHPVRRN83765483"

9. **Financial Logic (CRITICAL - The "0.00" Trap)**:
   - **NEVER** trust the "Amount Paid" if it is 0.00 or very low.
   - ALWAYS look for the **"Total"**, **"Gross Total"**, or **"Sub Total"** line.
   - If user used "PVR Passport", "Gift Card", or "Discount", the receipt shows high "Total" (e.g., ₹404.28) but "Amount Paid: ₹0.00". 
   - **EXTRACT the ₹404.28 value as gross_total, NOT the ₹0.00.**
   - Do NOT subtract discounts. We want the FULL VALUE of the transaction.

10. **Ticket Base Price**:
    - This is usually labeled as "Ticket Price", "Ticket Amount", "Base Fare" BEFORE fees.
    - Extract this number separately from convenience fees.
    - **HINT**: Ticket base prices (without convenience fees) ALWAYS end with .00 (e.g., 350.00, 450.00, 149.00). If you see a number ending in .00, it's likely the base price.

11. **Convenience Fees**:
    - Look for "Convenience Fees", "Internet Handling Fees", "Booking Fee"
    - Also extract GST/Tax ON FEES if listed separately (e.g., "CGST on CF", "SGST on CF")
    - Sum them: Convenience Fee + Tax on Fee = total convenience fee
`;

// Comprehensive JSON Schema for structured output
const responseSchema = {
  type: "OBJECT",
  properties: {
    movie_title: {
      type: "STRING",
      description: "Cleaned movie title without formats/languages/certifications"
    },
    theater_name: {
      type: "STRING",
      description: "Full cinema name with mall and city (e.g. 'INOX Megaplex Phoenix Palassio Lucknow')"
    },
    show_date: {
      type: "STRING",
      description: "Date in YYYY-MM-DD format"
    },
    show_time: {
      type: "STRING",
      description: "Start time in HH:MM AM/PM format (e.g. '10:00 AM', '07:30 PM')"
    },
    audi: {
      type: "STRING",
      description: "Screen/Audi/Hall number (e.g. 'Audi 3', 'Screen 5')"
    },
    seat_number: {
      type: "STRING",
      description: "Seat identifier(s) (e.g. 'G-12', 'A14, A15')"
    },
    formats: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "List of format tags found: ['IMAX', '3D', 'ATMOS', '4DX', '2D']"
    },
    booking_id: {
      type: "STRING",
      description: "Booking/Confirmation ID (e.g. 'TRAFCM4')"
    },
    pricing: {
      type: "OBJECT",
      properties: {
        ticket_base_price: {
          type: "NUMBER",
          description: "Base price of tickets BEFORE fees (e.g. 350.00)"
        },
        convenience_fee: {
          type: "NUMBER",
          description: "Convenience/Booking fee amount (e.g. 46.00)"
        },
        tax_on_fee: {
          type: "NUMBER",
          description: "GST/Tax on convenience fees (e.g. 8.28)"
        },
        gross_total: {
          type: "NUMBER",
          description: "TOTAL transaction value. If Amount Paid is 0, use Total/Subtotal line (e.g. 404.28)"
        },
        amount_paid_cash: {
          type: "NUMBER",
          description: "Actual cash/card paid (can be 0.00 if gift card used)"
        }
      }
    }
  }
};

export async function POST(request: NextRequest) {
  const timestamp = new Date().toISOString();
  console.log(`[OCR] Request received at ${timestamp}`);

  try {
    const body = await request.json();

    if (!body.image) {
      console.error("[OCR] No image data provided");
      return NextResponse.json({ error: "No image data provided" }, { status: 400 });
    }

    if (!GOOGLE_API_KEY) {
      console.error("[OCR] Server misconfiguration: GOOGLE_CLOUD_API_KEY is missing");
      return NextResponse.json({ error: "Server misconfiguration: Missing API Key" }, { status: 500 });
    }

    // Initialize Gemini
    const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

    // Clean base64 string
    const base64Data = body.image.replace(/^data:image\/\w+;base64,/, "");
    const sizeInBytes = Math.ceil(base64Data.length / 4) * 3;
    console.log(`[OCR] Image size approx: ${(sizeInBytes / 1024 / 1024).toFixed(2)} MB`);

    const usedModel = "gemini-3-flash-preview";
    console.log(`[OCR] Calling model: ${usedModel}`);

    const response = await ai.models.generateContent({
      model: usedModel,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
      contents: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Data,
          },
        },
        { text: "Extract ALL ticket details from this movie ticket image. Be thorough - extract showtime, theater, format, seat, audi, and all pricing information." },
      ],
    });

    const textResponse = response.text;
    if (!textResponse) {
      throw new Error("Empty response from AI model");
    }

    console.log("[OCR] Raw Gemini Response:", textResponse.substring(0, 800));

    // Parse the structured response
    let geminiData: any;
    try {
      const jsonStr = textResponse.replace(/```json/g, "").replace(/```/g, "").trim();
      geminiData = JSON.parse(jsonStr);
    } catch (e) {
      console.error("[OCR] JSON Parse Error", e);
      throw new Error("Failed to parse Gemini JSON response");
    }

    console.log("[OCR] Parsed data:", JSON.stringify(geminiData, null, 2));

    // Map Gemini schema response to TicketOCRData
    const ticketData: TicketOCRData = {
      movie_title: geminiData.movie_title || null,
      date: geminiData.show_date || null,
      showtime: geminiData.show_time || null,
      theater: geminiData.theater_name || null,
      audi: geminiData.audi || null,
      format: geminiData.formats?.join(", ") || null,
      seat: geminiData.seat_number || null,
      booking_id: geminiData.booking_id || null,
      // Pricing: ticket_base_price is the ticket cost, convenience fees are summed
      ticket_cost: geminiData.pricing?.ticket_base_price || null,
      convenience_fee: (geminiData.pricing?.convenience_fee || 0) + (geminiData.pricing?.tax_on_fee || 0),
    };

    // If ticket_cost is null but gross_total exists, calculate ticket_cost
    if (!ticketData.ticket_cost && geminiData.pricing?.gross_total) {
      const totalFees = (geminiData.pricing?.convenience_fee || 0) + (geminiData.pricing?.tax_on_fee || 0);
      ticketData.ticket_cost = geminiData.pricing.gross_total - totalFees;
    }

    console.log("[OCR] Mapped TicketData:", JSON.stringify(ticketData, null, 2));

    // TMDB Enrichment
    if (ticketData.movie_title && process.env.TMDB_API_KEY) {
      try {
        console.log(`[OCR] Searching TMDB for: ${ticketData.movie_title}`);
        const year = ticketData.date ? new Date(ticketData.date).getFullYear() : "";
        const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(ticketData.movie_title)}&year=${year}`;
        const tmdbRes = await fetch(searchUrl);
        if (tmdbRes.ok) {
          const tmdbData = await tmdbRes.json();
          if (tmdbData.results && tmdbData.results.length > 0) {
            const bestMatch = tmdbData.results[0];
            ticketData.tmdb_id = bestMatch.id;
            ticketData.overview = bestMatch.overview;
            ticketData.poster_path = bestMatch.poster_path;
            ticketData.backdrop_path = bestMatch.backdrop_path;
            ticketData.original_title = bestMatch.original_title;
            ticketData.release_date = bestMatch.release_date;
            console.log(`[OCR] TMDB Match: ${bestMatch.title} (ID: ${bestMatch.id})`);
          }
        }
      } catch (e) {
        console.error("[OCR] TMDB Error (non-critical)", e);
      }
    }

    return NextResponse.json(ticketData);

  } catch (error: any) {
    console.error("[OCR] Final Critical Failure:", error);
    return NextResponse.json(
      { error: `OCR Processing Failed: ${error.message || "Unknown error"}` },
      { status: 500 }
    );
  }
}
