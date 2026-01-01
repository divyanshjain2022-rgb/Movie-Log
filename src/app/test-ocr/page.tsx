"use client";

import { useState } from "react";

export default function OCRDiagnosticPage() {
    const [connectionStatus, setConnectionStatus] = useState<any>(null);
    const [ocrStatus, setOcrStatus] = useState<any>(null);
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);

    const testConnection = async () => {
        setLoading(true);
        setConnectionStatus("Testing...");
        try {
            const res = await fetch("/api/test-gemini");
            const data = await res.json();
            setConnectionStatus(data);
        } catch (e: any) {
            setConnectionStatus({ success: false, message: "Network Error: " + e.message });
        }
        setLoading(false);
    };

    const testOCR = async () => {
        if (!file) {
            alert("Please select a file first");
            return;
        }
        setLoading(true);
        setOcrStatus("Testing OCR...");

        try {
            // Convert to base64
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64 = reader.result as string;

                try {
                    const res = await fetch("/api/ocr", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ image: base64 }),
                    });

                    let data;
                    const text = await res.text();
                    try {
                        data = JSON.parse(text);
                    } catch (e) {
                        data = { error: "Failed to parse JSON", rawText: text };
                    }

                    setOcrStatus({
                        status: res.status,
                        ok: res.ok,
                        data: data
                    });
                } catch (fetchError: any) {
                    setOcrStatus({ error: "Fetch Error", details: fetchError.message });
                }
                setLoading(false);
            };
        } catch (e: any) {
            setOcrStatus({ error: "Client Error", details: e.message });
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8 bg-gray-50 min-h-screen text-gray-800">
            <h1 className="text-3xl font-bold mb-4">OCR Diagnostics</h1>

            {/* 1. API Key & Connection Check */}
            <section className="bg-white p-6 rounded shadow">
                <h2 className="text-xl font-semibold mb-2">1. Connection Test</h2>
                <p className="text-sm text-gray-600 mb-4">Tests if `GOOGLE_CLOUD_API_KEY` is set and `gemini-1.5-flash` is reachable.</p>
                <button
                    onClick={testConnection}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                    Test Connection
                </button>
                {connectionStatus && (
                    <pre className="mt-4 p-4 bg-gray-100 rounded overflow-auto text-sm">
                        {JSON.stringify(connectionStatus, null, 2)}
                    </pre>
                )}
            </section>

            {/* 2. Full OCR Test */}
            <section className="bg-white p-6 rounded shadow">
                <h2 className="text-xl font-semibold mb-2">2. OCR Flow Test</h2>
                <p className="text-sm text-gray-600 mb-4">Uploads an image to `/api/ocr` and shows the raw response (success or error).</p>

                <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-gray-500
            file:mr-4 file:py-2 file:px-4
            file:rounded-full file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100
            mb-4"
                />

                <button
                    onClick={testOCR}
                    disabled={loading || !file}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                    Test OCR
                </button>

                {ocrStatus && (
                    <div className="mt-4">
                        <h3 className="font-semibold">Result:</h3>
                        <pre className={`p-4 rounded overflow-auto text-sm ${ocrStatus.ok ? 'bg-green-50' : 'bg-red-50 text-red-800'}`}>
                            {JSON.stringify(ocrStatus, null, 2)}
                        </pre>
                    </div>
                )}
            </section>
        </div>
    );
}
