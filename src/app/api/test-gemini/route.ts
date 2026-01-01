import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function GET(request: NextRequest) {
    try {
        const apiKey = process.env.GOOGLE_CLOUD_API_KEY;

        if (!apiKey) {
            return NextResponse.json({
                success: false,
                message: "API Key (GOOGLE_CLOUD_API_KEY) is missing in environment variables."
            }, { status: 500 });
        }

        const ai = new GoogleGenAI({ apiKey });

        const model = "gemini-2.5-flash";
        console.log(`[Test] Testing connection with model: ${model}`);

        const response = await ai.models.generateContent({
            model: model,
            contents: [{ text: "Hello! Reply with 'OK' if you can hear me." }], // Simple text content for test
        });

        return NextResponse.json({
            success: true,
            model,
            response: response.text,
            message: "Connection successful!"
        });

    } catch (error: any) {
        console.error("[Test] Connection failed:", error);
        return NextResponse.json({
            success: false,
            message: error.message || "Unknown error",
            details: JSON.stringify(error, null, 2)
        }, { status: 500 });
    }
}
