import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(request: NextRequest) {
  try {
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    const { image, mimeType } = await request.json();

    if (!image) {
      return NextResponse.json(
        { error: "No image provided" },
        { status: 400 }
      );
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType || "image/jpeg",
                  data: image,
                },
              },
              {
                type: "text",
                text: `Extract movie ticket information from this image. Return ONLY valid JSON with no additional text:
{
  "movie_title": "string or null",
  "date": "YYYY-MM-DD or null",
  "showtime": "HH:MM (24hr) or null",
  "theater": "string or null",
  "audi": "string or null",
  "format": "string (e.g. IMAX 2D, 3D) or null",
  "seat": "string or null",
  "ticket_cost": number or null,
  "convenience_fee": number or null,
  "booking_id": "string or null"
}
If a field cannot be determined from the image, use null. Extract numbers without currency symbols.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Claude API error:", error);
      return NextResponse.json(
        { error: "Failed to process image" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const content = data.content[0]?.text;

    if (!content) {
      return NextResponse.json(
        { error: "No response from Claude" },
        { status: 500 }
      );
    }

    // Parse the JSON response from Claude
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      const ticketData = JSON.parse(jsonMatch[0]);
      return NextResponse.json(ticketData);
    } catch (parseError) {
      console.error("Failed to parse Claude response:", content);
      return NextResponse.json(
        { error: "Failed to parse ticket data" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("OCR error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
