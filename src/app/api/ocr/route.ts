import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
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

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

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
    - convenience_fee (number): The TOTAL "Convenience Fees" or "Internet Handling Fees" plus any tax on it. 
       CRITICAL: If the receipt shows a "Total" and a "Ticket Price", calculate: (Total - Ticket Price).
       Example: Total 173.78, Ticket Price 149.00 -> Convenience Fee = 24.78.
       If explicitly listed as "Convenience Fees" (e.g. 21.00) and distinct taxes (e.g. 3.78) are below it, SUM THEM UP (24.78).
    
    If a field is missing, set it to null.
    `;

    console.log("Calling Gemini 1.5 Flash...");
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: body.image, mimeType: "image/jpeg" } }
    ]);

    const response = await result.response;
    const text = response.text();
    console.log("Gemini Response:", text);

    const ticketData: TicketOCRData = JSON.parse(text);

    // TMDB Enrichment (Optional - Keep existing logic if needed, or ask Gemini to do it? 
    // Gemini 1.5 Flash acts as OCR here, TMDB enrichment is best done via specific ID search separately 
    // to match DB, but for now we keep the OCR part clean. 
    // The previous code had TMDB enrichment at the end. I will port it back if requested, 
    // but the prompt asked to "fix parsing". I'll add the TMDB enrichment back to maintain parity.)

    // ... Parsing Parity: Add TMDB Enrichment ...
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

  } catch (error) {
    console.error("OCR Critical Failure:", error);
    return NextResponse.json(
      { error: "Internal Server Error during OCR processing." },
      { status: 500 }
    );
  }
}
