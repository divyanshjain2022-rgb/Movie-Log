import { NextRequest, NextResponse } from "next/server";

// Google Cloud Vision API endpoint
const VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate";
const GOOGLE_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;

interface GiftCardData {
  card_number: string | null;
  pin: string | null;
  face_value: number | null;
  expiry_date: string | null;
  platform: string | null;
  raw_text?: string;
}

export async function POST(request: NextRequest) {
  try {
    if (!GOOGLE_API_KEY) {
      return NextResponse.json(
        { error: "GOOGLE_CLOUD_API_KEY not configured" },
        { status: 500 }
      );
    }

    const { image } = await request.json();

    if (!image) {
      return NextResponse.json(
        { error: "No image provided" },
        { status: 400 }
      );
    }

    // Call Google Cloud Vision API
    const response = await fetch(`${VISION_API_URL}?key=${GOOGLE_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: image,
            },
            features: [
              {
                type: "DOCUMENT_TEXT_DETECTION",
                maxResults: 1,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Google Vision API error:", error);
      return NextResponse.json(
        { error: "Failed to process image" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const textAnnotations = data.responses?.[0]?.textAnnotations;

    if (!textAnnotations || textAnnotations.length === 0) {
      return NextResponse.json(
        { error: "No text found in image" },
        { status: 400 }
      );
    }

    const fullText = textAnnotations[0].description || "";
    const giftCardData = parseGiftCardText(fullText);

    return NextResponse.json(giftCardData);
  } catch (error) {
    console.error("Gift Card OCR error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function parseGiftCardText(text: string): GiftCardData {
  const result: GiftCardData = {
    card_number: null,
    pin: null,
    face_value: null,
    expiry_date: null,
    platform: null,
    raw_text: text,
  };

  // === PLATFORM DETECTION ===
  result.platform = extractPlatform(text);

  // === CARD NUMBER ===
  result.card_number = extractCardNumber(text);

  // === PIN ===
  result.pin = extractPin(text);

  // === FACE VALUE ===
  result.face_value = extractFaceValue(text);

  // === EXPIRY DATE ===
  result.expiry_date = extractExpiryDate(text);

  return result;
}

function extractPlatform(text: string): string | null {
  const textLower = text.toLowerCase();

  // PVR INOX patterns
  if (/pvr\s*inox|pvr\s*cinemas|pvr\s*gift\s*card/i.test(text)) {
    return "PVR INOX";
  }

  // Other cinema chains
  if (/cinepolis/i.test(text)) return "Cinepolis";
  if (/carnival\s*cinemas/i.test(text)) return "Carnival Cinemas";
  if (/miraj\s*cinemas/i.test(text)) return "Miraj Cinemas";

  // E-commerce/Voucher platforms
  if (/amazon/i.test(text)) return "Amazon";
  if (/flipkart/i.test(text)) return "Flipkart";
  if (/myntra/i.test(text)) return "Myntra";
  if (/swiggy/i.test(text)) return "Swiggy";
  if (/zomato/i.test(text)) return "Zomato";
  if (/bookmyshow/i.test(text)) return "BookMyShow";

  // Check for woohoo (gift card aggregator)
  if (/woohoo/i.test(text)) {
    // Try to find the actual brand
    if (/pvr/i.test(text)) return "PVR INOX";
  }

  return null;
}

function extractCardNumber(text: string): string | null {
  // Pattern 1: "CODE" or "Card Number" followed by a long number
  // PVR cards typically have 16-digit codes starting with 1000
  const codePatterns = [
    /code[:\s]+(\d{13,20})/i,
    /card\s*number[:\s]+(\d{13,20})/i,
    /card\s*no\.?[:\s]+(\d{13,20})/i,
    /voucher\s*(?:code|number)[:\s]+(\d{13,20})/i,
  ];

  for (const pattern of codePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }

  // Pattern 2: Look for standalone 16-digit numbers starting with 1000 (PVR format)
  const pvrCardPattern = text.match(/\b(1000\d{12,16})\b/);
  if (pvrCardPattern) {
    return pvrCardPattern[1];
  }

  // Pattern 3: Any 16-digit number that's not a phone number
  const longNumberPattern = text.match(/\b(\d{16})\b/);
  if (longNumberPattern) {
    // Verify it's not just repeated digits or sequential
    const num = longNumberPattern[1];
    if (!/^(\d)\1+$/.test(num) && !/^0123456789/.test(num)) {
      return num;
    }
  }

  return null;
}

function extractPin(text: string): string | null {
  // Pattern 1: "PIN" followed by 4-6 digit number
  const pinPatterns = [
    /pin[:\s]+(\d{4,6})/i,
    /pin\s*code[:\s]+(\d{4,6})/i,
    /security\s*code[:\s]+(\d{4,6})/i,
  ];

  for (const pattern of pinPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }

  // Pattern 2: Look for 6-digit number near "PIN" text
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/pin/i.test(lines[i])) {
      // Check same line for number
      const sameLine = lines[i].match(/\b(\d{4,6})\b/);
      if (sameLine) return sameLine[1];

      // Check next line
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].match(/^\s*(\d{4,6})\s*$/);
        if (nextLine) return nextLine[1];
      }
    }
  }

  return null;
}

function extractFaceValue(text: string): number | null {
  // Pattern 1: Currency symbol followed by amount
  const amountPatterns = [
    /₹\s*([\d,]+(?:\.\d{2})?)/,
    /rs\.?\s*([\d,]+(?:\.\d{2})?)/i,
    /inr\s*([\d,]+(?:\.\d{2})?)/i,
    /amount[:\s]*₹?\s*([\d,]+(?:\.\d{2})?)/i,
    /value[:\s]*₹?\s*([\d,]+(?:\.\d{2})?)/i,
    /face\s*value[:\s]*₹?\s*([\d,]+(?:\.\d{2})?)/i,
  ];

  const amounts: number[] = [];

  for (const pattern of amountPatterns) {
    const matches = text.matchAll(new RegExp(pattern, 'gi'));
    for (const match of matches) {
      const amount = parseFloat(match[1].replace(/,/g, ""));
      if (amount > 0 && amount <= 50000) {
        amounts.push(amount);
      }
    }
  }

  // Return the largest amount (likely the face value, not remaining balance)
  if (amounts.length > 0) {
    // Sort descending and return largest
    amounts.sort((a, b) => b - a);
    return amounts[0];
  }

  return null;
}

function extractExpiryDate(text: string): string | null {
  // Pattern 1: "Validity" or "Valid till" or "Expiry"
  const validityPatterns = [
    /validity[:\s]*(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i,
    /valid\s*(?:till|until|upto)[:\s]*(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i,
    /expir(?:y|es)[:\s]*(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i,
    /valid\s*(?:till|until)[:\s]*(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/i,
  ];

  for (const pattern of validityPatterns) {
    const match = text.match(pattern);
    if (match) {
      // Check if it's DD MMM YYYY format or DD/MM/YYYY
      if (/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(match[2])) {
        return normalizeDate(match[1], match[2], match[3]);
      } else {
        // DD/MM/YYYY format
        let year = match[3];
        if (year.length === 2) {
          year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
        }
        return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
      }
    }
  }

  // Pattern 2: Look for date near "validity" or "expiry" keywords
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/validity|expir|valid\s*till/i.test(lines[i])) {
      // Check same line
      const dateMatch = lines[i].match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i);
      if (dateMatch) {
        return normalizeDate(dateMatch[1], dateMatch[2], dateMatch[3]);
      }

      // Check next line
      if (i + 1 < lines.length) {
        const nextDateMatch = lines[i + 1].match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i);
        if (nextDateMatch) {
          return normalizeDate(nextDateMatch[1], nextDateMatch[2], nextDateMatch[3]);
        }
      }
    }
  }

  return null;
}

function normalizeDate(day: string, month: string, year: string): string {
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
  };

  const m = months[month.toLowerCase().substring(0, 3)];
  const d = day.padStart(2, "0");

  return `${year}-${m}-${d}`;
}
