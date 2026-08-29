import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const GOOGLE_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;

const EXTRACTION_PROMPT = `You are an expert OCR system for Indian gift card images and voucher screenshots.

Read ALL text in the image carefully, then extract the fields below.

COMMON GIFT CARD FORMATS:

=== PVR INOX GIFT CARD ===
- Shows "PVR INOX" branding
- Card number: 16-digit number, often starting with 1000
- PIN: 4-6 digit number
- Face value: Amount in ₹
- Validity/Expiry date

=== WOOHOO / ZINGOY VOUCHER ===
- Shows platform branding (Woohoo, Zingoy, etc.)
- Voucher code or card number
- PIN if present
- Face value in ₹
- Validity period

=== BOOKING PLATFORM GIFT CARD (BookMyShow, Amazon Pay) ===
- Card/voucher code
- PIN
- Balance or face value
- Expiry date

=== EXTRACTION RULES ===

CARD NUMBER: The main card/voucher code (typically 16+ digits for PVR, or alphanumeric for other platforms)
PIN: The PIN or security code (typically 4-6 digits)
FACE VALUE: The card's total value in ₹ (not remaining balance). Return as a number without currency symbol.
EXPIRY DATE: Return strictly as YYYY-MM-DD. Convert any date format.
PLATFORM: Identify the brand/platform:
  - "PVR INOX" for PVR/INOX cards
  - "BookMyShow" for BMS vouchers
  - "Amazon Pay" for Amazon gift cards
  - "Zingoy" / "Woohoo" for aggregator vouchers
  - Return the actual brand name in title case

Return valid JSON. Use null for truly missing fields.`;

const responseSchema = {
  type: "OBJECT" as const,
  properties: {
    card_number: { type: "STRING" as const, description: "Card/voucher code or number", nullable: true },
    pin: { type: "STRING" as const, description: "PIN or security code", nullable: true },
    face_value: { type: "NUMBER" as const, description: "Face value amount in rupees", nullable: true },
    expiry_date: { type: "STRING" as const, description: "Expiry date in YYYY-MM-DD format", nullable: true },
    platform: { type: "STRING" as const, description: "Gift card platform/brand name", nullable: true },
  },
};

// Edge Runtime: 30s timeout on Hobby (vs 10s for Node.js serverless)
export const runtime = "edge";

function detectMimeType(imageData: string, providedMime?: string): string {
  const dataUriMatch = imageData.match(/^data:([^;]+);base64,/);
  if (dataUriMatch) return dataUriMatch[1];
  if (providedMime) return providedMime;

  try {
    const raw = atob(imageData.substring(0, 16));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return "image/webp";
  } catch {
    // Fall through
  }

  return "image/jpeg";
}

function stripDataUri(data: string): string {
  const commaIndex = data.indexOf(",");
  if (commaIndex !== -1 && data.substring(0, commaIndex).includes("base64")) {
    return data.substring(commaIndex + 1);
  }
  return data;
}

export async function POST(request: NextRequest) {
  try {
    if (!GOOGLE_API_KEY) {
      return NextResponse.json(
        { error: "Server misconfiguration: Missing API Key" },
        { status: 500 }
      );
    }

    const body = await request.json();

    if (!body.image) {
      return NextResponse.json(
        { error: "No image data provided" },
        { status: 400 }
      );
    }

    const mimeType = detectMimeType(body.image, body.mimeType);
    const base64Data = stripDataUri(body.image);

    console.log(`[GC-OCR] Processing image, MIME: ${mimeType}`);

    const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

    const GC_MODELS = ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
    let response;
    let lastError: unknown = null;
    for (const model of GC_MODELS) {
      try {
        response = await ai.models.generateContent({
          model,
          config: {
            systemInstruction: EXTRACTION_PROMPT,
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
                {
                  text: "Read every piece of text in this gift card image. Extract the card number, PIN, face value, expiry date, and platform.",
                },
              ],
            },
          ],
        });
        break; // Success — stop trying other models
      } catch (apiError: unknown) {
        lastError = apiError;
        const status = (apiError as { status?: number })?.status;
        const message = apiError instanceof Error ? apiError.message : "";
        console.error(`[GC-OCR] ${model} failed:`, status, message.substring(0, 160));
        if (status === 429 || status === 503 || message.includes("RESOURCE_EXHAUSTED")) {
          continue; // Quota/unavailable: fall through to the next model
        }
        throw apiError;
      }
    }
    if (!response) {
      throw lastError instanceof Error
        ? lastError
        : new Error("All Gemini models failed (quota exhausted). Try again later.");
    }

    const textResponse = response.text;
    if (!textResponse) {
      throw new Error("Empty response from AI model");
    }

    console.log("[GC-OCR] Raw response:", textResponse.substring(0, 500));

    let geminiData: any;
    try {
      const jsonStr = textResponse.replace(/```json/g, "").replace(/```/g, "").trim();
      geminiData = JSON.parse(jsonStr);
    } catch (e) {
      console.error("[GC-OCR] JSON Parse Error:", e);
      throw new Error("Failed to parse response as JSON");
    }

    console.log("[GC-OCR] Parsed:", JSON.stringify(geminiData, null, 2));

    return NextResponse.json({
      card_number: geminiData.card_number || null,
      pin: geminiData.pin || null,
      face_value: geminiData.face_value || null,
      expiry_date: geminiData.expiry_date || null,
      platform: geminiData.platform || null,
    });
  } catch (error: any) {
    console.error("[GC-OCR] Error:", error);
    return NextResponse.json(
      { error: `Gift Card OCR Failed: ${error.message || "Unknown error"}` },
      { status: 500 }
    );
  }
}
