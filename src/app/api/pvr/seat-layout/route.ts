import { NextRequest, NextResponse } from "next/server";
import { fetchPvrSeatLayout } from "@/lib/pvr/client";
import { findPvrCity } from "@/lib/pvr/cities";

interface SeatLayoutRequest {
  city?: string;
  dated?: string;
  encrypted?: string;
  showKey?: string;
}

export async function POST(request: NextRequest) {
  let body: SeatLayoutRequest;
  try {
    body = (await request.json()) as SeatLayoutRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.encrypted || !body.showKey || !body.dated) {
    return NextResponse.json({ error: "Missing show details" }, { status: 400 });
  }

  const city = findPvrCity(body.city || "Lucknow").name;

  try {
    const result = await fetchPvrSeatLayout({
      city,
      dated: body.dated,
      encrypted: body.encrypted,
      showKey: body.showKey,
    });

    return NextResponse.json({
      quote: result.data,
      stale: result.cache.stale,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load seat layout",
      },
      { status: 500 }
    );
  }
}
