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
  try {
    const body = (await request.json()) as SeatLayoutRequest;
    const city = findPvrCity(body.city || "Lucknow").name;

    if (!body.dated || !body.encrypted || !body.showKey) {
      return NextResponse.json(
        { error: "dated, encrypted, and showKey are required" },
        { status: 400 }
      );
    }

    const result = await fetchPvrSeatLayout({
      city,
      dated: body.dated,
      encrypted: body.encrypted,
      showKey: body.showKey,
    });

    return NextResponse.json({
      city,
      quote: result.data,
      cache: result.cache,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch PVR seat layout" },
      { status: 502 }
    );
  }
}
