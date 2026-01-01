import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { TicketOCRData } from "@/types";

const GOOGLE_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;

// System instruction for PVR/INOX tickets
const systemInstruction = `
You are a specialized data extraction engine for movie tickets (specifically PVR/INOX receipts). 
Your job is to extract data accurately from screenshots of booking confirmations and tax invoices.

CRITICAL EXTRACTION RULES:

1. **Movie Title Cleanup**: 
   - Extract the full title but remove format tags (IMAX, 3D, 4DX, ICE), language (Hindi, English), and certifications (UA 16+, A).
   - Example: "TRON: ARES (3D ENGLISH IMAX)" -> "TRON: ARES"
   - Example: "JOLLY LLB 3 (HINDI ATMOS)" -> "JOLLY LLB 3"

2. **Date Parsing**: 
   - Convert all dates to strictly YYYY-MM-DD.
   - If the receipt shows "Fri, 10 Oct" and no year, assume the year is 2025 (or the nearest future date). 
   - Look closely: Some invoices (blue background) explicitly state the year (e.g., "28 Nov 2025"). Use that.

3. **Financial Logic (The "0.00" Trap)**:
   - **Never** trust the "Amount Paid" if it is 0.00.
   - You must look for the **"Total"** or **"Gross Total"** line.
   - If the user used a "PVR Passport" or "Gift Card", the receipt will show a high "Total" (e.g., ₹404.28) but "Amount Paid: ₹0.00". **Extract the ₹404.28 value.**
   - Do NOT subtract discounts. We want the value of the transaction, not the cash paid.

4. **Convenience Fees**:
   - Extract the specific line item for "Convenience Fees" (or "Internet Handling Fees").
   - Extract the specific line item for "GST" or "Tax" associated with those fees if listed separately.

5. **Formats**:
   - Look for keywords: IMAX, 3D, 4DX, ATMOS, ICE, PXL. Return them as a list.
`;

// JSON Schema for structured output
const responseSchema = {
  type: "OBJECT",
  properties: {
    movie_title: {
      type: "STRING",
      description: "Cleaned movie title. No formats/languages."
    },
    theater_name: {
      type: "STRING",
      description: "Name of the cinema (e.g. 'INOX Megaplex Phoenix Palassio')."
    },
    show_date: {
      type: "STRING",
      description: "YYYY-MM-DD"
    },
    show_time: {
      type: "STRING",
      description: "e.g. '10:00 AM' or '22:00'"
    },
    seat_number: {
      type: "STRING",
      description: "e.g. 'A14' or 'Screen 4 - A14'"
    },
    audi: {
      type: "STRING",
      description: "Audi/Screen number if present"
    },
    formats: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "List of tags: ['IMAX', '3D', 'Atmos']"
    },
    booking_id: {
      type: "STRING",
      description: "Alphanumeric Booking ID (e.g. 'TRAFCM4')"
    },
    pricing: {
      type: "OBJECT",
      properties: {
        ticket_base_price: {
          type: "NUMBER",
          description: "The base price of the tickets (e.g. 350.00). Exclude fees."
        },
        convenience_fee: {
          type: "NUMBER",
          description: "The explicit Convenience Fee line item (e.g. 46.00)."
        },
        tax_on_fee: {
          type: "NUMBER",
          description: "The GST/Tax line item specifically under fees (e.g. 8.28)."
        },
        gross_total: {
          type: "NUMBER",
          description: "The final Transaction Value. If 'Amount Paid' is 0, use the 'Total' or struck-through price."
        },
        amount_paid_cash: {
          type: "NUMBER",
          description: "The actual money paid (can be 0.00)."
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

    const usedModel = "gemini-2.5-flash";
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
        { text: "Extract this ticket." },
      ],
    });

    const textResponse = response.text;
    if (!textResponse) {
      throw new Error("Empty response from AI model");
    }

    console.log("[OCR] Raw Gemini Response:", textResponse.substring(0, 500) + "...");

    // Parse the structured response
    let geminiData: any;
    try {
      const jsonStr = textResponse.replace(/```json/g, "").replace(/```/g, "").trim();
      geminiData = JSON.parse(jsonStr);
    } catch (e) {
      console.error("[OCR] JSON Parse Error", e);
      throw new Error("Failed to parse Gemini JSON response");
    }

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
      // Pricing: Use gross_total for ticket_cost if base is missing, and sum fees
      ticket_cost: geminiData.pricing?.ticket_base_price || geminiData.pricing?.gross_total || null,
      convenience_fee: (geminiData.pricing?.convenience_fee || 0) + (geminiData.pricing?.tax_on_fee || 0),
    };

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
