import { NextRequest, NextResponse } from "next/server";
import { fetchPvrComingSoon } from "@/lib/pvr/client";
import { findPvrCity } from "@/lib/pvr/cities";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const city = findPvrCity(searchParams.get("city") || "Lucknow").name;
    const languages = searchParams.get("languages") || "";
    const genres = searchParams.get("genres") || "";
    const text = searchParams.get("text") || "";

    const result = await fetchPvrComingSoon({ city, languages, genres, text });
    return NextResponse.json({
      city,
      movies: result.data,
      cache: result.cache,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch PVR upcoming movies" },
      { status: 502 }
    );
  }
}
