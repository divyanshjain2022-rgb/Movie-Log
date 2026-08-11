// Hetzner Inference API — OpenAI-compatible chat completions.
//
// Replaces Gemini on the bot's paths. The reason for the move is quota: the
// Gemini free tier allows ~20 requests/day per model, which is why the old
// code carried a four-model fallback chain. Hetzner's limit is 10M input /
// 200k output tokens per 60s, so a single model is enough.
//
// Experimental service, free while it stays that way, no SLA — a 5xx here
// means the bot's chat is down until it recovers.

const BASE_URL = "https://inference.hetzner.com/api/v1";

// Kimi-K2.7-Code takes images as well as text, so one model covers both the
// chat loop and the image reads. It is the heavier of the two vision-capable
// options (32B active vs Qwen3.6's 3B) — watch the 60s function ceiling if the
// tool loop starts timing out.
export const CHAT_MODEL = "Kimi-K2.7-Code";
export const VISION_MODEL = "Kimi-K2.7-Code";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  response_format?: Record<string, unknown>;
  max_tokens?: number;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string | null; tool_calls?: ToolCall[] };
    finish_reason: string;
  }>;
}

export class InferenceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function chatCompletion(
  request: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  const apiKey = process.env.HETZNER_API_KEY;
  if (!apiKey) throw new InferenceError(0, "HETZNER_API_KEY is not set");

  // The platform is experimental and throws transient upstream 5xx ("Too many
  // open files" was seen in a two-request test), so one retry is worth it.
  let lastError: InferenceError | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (response.ok) return (await response.json()) as ChatCompletionResponse;

    lastError = new InferenceError(response.status, (await response.text()).slice(0, 400));
    if (response.status < 500) break;
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  throw lastError as InferenceError;
}

// Models wrap JSON in prose or fences often enough that the raw parse alone
// isn't worth trusting, even with response_format set.
export function parseJsonLoose<T>(raw: string | null): T | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

/**
 * Read an image and get structured JSON back. The schema is passed in the
 * prompt, NOT via response_format: Hetzner's guided decoding corrupts its own
 * output on this model — a correct reading of a receipt came back as
 * `{"{"total":1344.0}`, which no parser can rescue. Prompted JSON plus a
 * tolerant parse is measurably more reliable here. Verified 2026-08-11 against
 * a test bill: prompted mode returned total, all items and a reformatted date
 * correctly; schema mode returned unparseable JSON for the same image.
 */
export async function visionJson<T>(options: {
  prompt: string;
  base64: string;
  mime: string;
  schema: Record<string, unknown>;
}): Promise<T | null> {
  const response = await chatCompletion({
    model: VISION_MODEL,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${options.mime};base64,${options.base64}` } },
          {
            type: "text",
            text: `${options.prompt}\n\nReply with JSON only, matching this schema:\n${JSON.stringify(options.schema)}`,
          },
        ],
      },
    ],
  });
  return parseJsonLoose<T>(response.choices?.[0]?.message?.content ?? null);
}
