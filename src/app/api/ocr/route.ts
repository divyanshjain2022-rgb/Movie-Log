import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { TicketOCRData } from "@/types";

const GOOGLE_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;

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

    // Initialize Gemini with new SDK
    const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

    const prompt = `
    Analyze this movie ticket image and extract the following details in JSON format.
    Ensure all prices are numbers (float). Dates should be in YYYY-MM-DD format.
    
    Fields to extract:
    - movie_title (string): The name of the movie. Clean it up (remove '3D', 'IMAX', language).
    - theater (string): Examples: "Phoenix Pallasio Mall", "Lulu Mall". Don't include address details.
    - date (string): YYYY-MM-DD format. Use current year if missing.
    - showtime (string): e.g. "4:00 PM", "16:00".
    - format (string): e.g. "IMAX 3D", "3D", "4DX", "2D", "Dolby Atmos".
    - seat (string): e.g. "A14".
    - booking_id (string): e.g. "TMAZJS3".
    - ticket_cost (number): The base cost of the tickets WITHOUT convenience fees or taxes. 
      NOTE: Use the GROSS price before any discounts (like "PVR Passport" or Gift Cards) are applied.
    - convenience_fee (number): The TOTAL "Convenience Fees" or "Internet Handling Fees" plus any tax on it. 
       CRITICAL: If the receipt shows a "Total" and a "Ticket Price", calculate: (Total - Ticket Price).
       Example: Total 173.78, Ticket Price 149.00 -> Convenience Fee = 24.78.
       If explicitly listed as "Convenience Fees" (e.g. 21.00) and distinct taxes (e.g. 3.78) are below it, SUM THEM UP (24.78).
       IMPORTANT: If the "Amount Paid" is 0.00 or less than Total due to Gift Card/Passport, IGNORE Amount Paid. Use the full "Total" or "Subtotal" value to calculate fees.
    
    If a field is missing, set it to null.
    `;

    console.log("Calling Gemini 2.5 Flash...");

    // Ensure clean base64 string (remove data URL prefix if present)
    const base64Data = body.image.replace(/^data:image\/\w+;base64,/, "");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: { responseMimeType: "application/json" },
      contents: [
        { text: prompt },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Data,
          },
        },
      ],
    });

    const text = response.text;
    console.log("Gemini Response:", text);

    let ticketData: TicketOCRData;
    try {
      ticketData = JSON.parse(text || "{}");
    } catch (e) {
      console.error("JSON Parse Error", e);
      throw new Error("Failed to parse Gemini response");
    }

    // TMDB Enrichment
    if (ticketData.movie_title && process.env.TMDB_API_KEY) {
      try {
        console.log(`Searching TMDB for: ${ticketData.movie_title}`);
        const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(ticketData.movie_title)}&year=${ticketData.date ? new Date(ticketData.date).getFullYear() : ""}`;
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
          }
        }
      } catch (e) { console.error("TMDB Error", e); }
    }

    return NextResponse.json(ticketData);

  } catch (error: any) {
    console.error("OCR Critical Failure:", error);
    return NextResponse.json(
      { error: `OCR Failed: ${error.message || "Unknown error"}` },
      { status: 500 }
    );
  }
}
