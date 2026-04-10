import { NextRequest, NextResponse } from "next/server";
import { fetchPvrSessions } from "@/lib/pvr/client";
import { findPvrCity, todayInIndia } from "@/lib/pvr/cities";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const movieId = searchParams.get("movieId");
    const movieTitle = searchParams.get("title") || "Movie";

    if (!movieId) {
      return NextResponse.json({ error: "movieId is required" }, { status: 400 });
    }

    const city = findPvrCity(searchParams.get("city") || "Lucknow").name;
    const date = searchParams.get("date") || todayInIndia();
    const language = searchParams.get("language") || "ALL";
    const format = searchParams.get("format") || "ALL";
    const time = searchParams.get("time") || "08:00-24:00";

    const result = await fetchPvrSessions({
      city,
      movieId,
      movieTitle,
      date,
      language,
      format,
      time,
    });

    return NextResponse.json({
      city,
      movieId,
      title: movieTitle,
      date,
      shows: result.data,
      cache: result.cache,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch PVR sessions" },
      { status: 502 }
    );
  }
}
