/**
 * Direct Google Gemini API integration.
 *
 * Uses the official REST API (generativelanguage.googleapis.com)
 * with x-goog-api-key authentication.
 *
 * Converts between OpenAI message format ↔ Google Gemini format
 * so it can plug into our existing callLlm() pipeline.
 *
 * Env var: GOOGLE_GEMINI_API_KEY
 */

const GOOGLE_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// App model name → Google model name
export const TO_GOOGLE_MODEL: Record<string, string> = {
  "gemini-2.5-flash-preview-05-20": "gemini-2.5-flash",
  "gemini-2.5-flash-thinking": "gemini-2.5-flash",
  "gemini-3.1-pro-preview-thinking-high": "gemini-3.1-pro-preview",
};

export function useGoogleGemini(): boolean {
  return !!process.env.GOOGLE_GEMINI_API_KEY;
}

// ── OpenAI messages → Google Gemini request body ──

interface OpenAIMessage {
  role: string;
  content: any;
}

interface GooglePart {
  text: string;
}

interface GoogleContent {
  role: "user" | "model";
  parts: GooglePart[];
}

function convertMessages(messages: OpenAIMessage[]): {
  systemInstruction?: { parts: GooglePart[] };
  contents: GoogleContent[];
} {
  let systemInstruction: { parts: GooglePart[] } | undefined;
  const contents: GoogleContent[] = [];

  for (const msg of messages) {
    const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);

    if (msg.role === "system") {
      // Google uses systemInstruction for system messages
      if (!systemInstruction) {
        systemInstruction = { parts: [{ text }] };
      } else {
        // Append to existing system instruction
        systemInstruction.parts.push({ text });
      }
    } else {
      const role = msg.role === "assistant" ? "model" : "user";
      contents.push({ role, parts: [{ text }] });
    }
  }

  return { systemInstruction, contents };
}

// ── Google response → OpenAI-compatible response ──

function buildOpenAIResponse(googleData: any): string {
  const candidate = googleData.candidates?.[0];
  const content = candidate?.content?.parts?.map((p: any) => p.text).join("") ?? "";
  const finishReason = mapFinishReason(candidate?.finishReason);

  const usage = googleData.usageMetadata
    ? {
        prompt_tokens: googleData.usageMetadata.promptTokenCount ?? 0,
        completion_tokens: googleData.usageMetadata.candidatesTokenCount ?? 0,
        thinking_tokens: googleData.usageMetadata.thoughtsTokenCount ?? 0,
        total_tokens: googleData.usageMetadata.totalTokenCount ?? 0,
      }
    : undefined;

  return JSON.stringify({
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finishReason }],
    ...(usage && { usage }),
  });
}

function mapFinishReason(reason?: string): string {
  switch (reason) {
    case "STOP": return "stop";
    case "MAX_TOKENS": return "length";
    case "SAFETY": return "content_filter";
    default: return "stop";
  }
}

// ── Streaming: Google SSE → OpenAI SSE ──

function transformGoogleStreamToOpenAI(inputBody: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = inputBody.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // Process remaining buffer
            if (buffer.trim()) {
              const chunks = processGoogleLines(buffer.split("\n"));
              for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          const chunks = processGoogleLines(lines);
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          if (chunks.length > 0) return; // Yield control
        }
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      reader.cancel();
    },
  });
}

function processGoogleLines(lines: string[]): string[] {
  const output: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ")) continue;

    const dataStr = trimmed.slice(6);
    if (dataStr === "[DONE]") {
      output.push("data: [DONE]\n\n");
      continue;
    }

    try {
      const data = JSON.parse(dataStr);
      const candidate = data.candidates?.[0];
      if (!candidate) continue;

      const text = candidate.content?.parts?.map((p: any) => p.text).join("") ?? "";
      if (text) {
        const openaiChunk = { choices: [{ index: 0, delta: { content: text } }] };
        output.push(`data: ${JSON.stringify(openaiChunk)}\n\n`);
      }

      // If usageMetadata present (usually on last chunk), emit usage
      if (data.usageMetadata) {
        const usageChunk = {
          choices: [{ index: 0, delta: {} }],
          usage: {
            prompt_tokens: data.usageMetadata.promptTokenCount ?? 0,
            completion_tokens: data.usageMetadata.candidatesTokenCount ?? 0,
            thinking_tokens: data.usageMetadata.thoughtsTokenCount ?? 0,
            total_tokens: data.usageMetadata.totalTokenCount ?? 0,
          },
        };
        output.push(`data: ${JSON.stringify(usageChunk)}\n\n`);
      }
    } catch {
      // Skip unparseable
    }
  }

  return output;
}

// ── Main call function ──

export interface GoogleGeminiOptions {
  model: string;          // App model name (mapped to Google model internally)
  messages: OpenAIMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  response_format?: any;
  timeoutMs?: number;
}

/**
 * Call Google Gemini API directly and return an OpenAI-compatible Response.
 * Throws on error.
 */
export async function callGoogleGemini(options: GoogleGeminiOptions): Promise<Response> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GEMINI_API_KEY not set");

  const googleModel = TO_GOOGLE_MODEL[options.model] ?? options.model;
  const { messages, stream, max_tokens, temperature, response_format, timeoutMs = 120_000 } = options;

  // Build Google request body
  const { systemInstruction, contents } = convertMessages(messages);

  const generationConfig: Record<string, any> = {};
  // Gemini 2.5 Flash thinking tokens count towards maxOutputTokens,
  // so we need a much higher limit to avoid truncation.
  // Minimum 8192 to leave room for thinking (~1000-5000 tokens).
  if (max_tokens != null) generationConfig.maxOutputTokens = Math.max(max_tokens, 8192);
  if (temperature != null) generationConfig.temperature = temperature;
  if (response_format?.type === "json_object") {
    generationConfig.responseMimeType = "application/json";
  }

  const body: Record<string, any> = { contents };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;

  // Choose endpoint
  const endpoint = stream
    ? `${GOOGLE_API_BASE}/models/${googleModel}:streamGenerateContent?alt=sse`
    : `${GOOGLE_API_BASE}/models/${googleModel}:generateContent`;

  console.log(`[google-llm] calling ${googleModel} stream=${!!stream} endpoint=${stream ? "streamGenerateContent" : "generateContent"}`);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[google-llm] HTTP ${res.status}: ${errText.slice(0, 300)}`);
    throw new Error(`google: HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  if (stream) {
    // Transform Google SSE → OpenAI SSE
    const transformedStream = transformGoogleStreamToOpenAI(res.body!);
    return new Response(transformedStream, {
      status: 200,
      headers: new Headers({ "content-type": "text/event-stream" }),
    });
  } else {
    // Transform Google JSON → OpenAI JSON
    const googleData = await res.json();
    const candidate = googleData.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const partCount = candidate?.content?.parts?.length ?? 0;
    const rawText = candidate?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("") ?? "";
    console.log(`[google-llm] response: finishReason=${finishReason} parts=${partCount} textLen=${rawText.length} usage=${JSON.stringify(googleData.usageMetadata ?? {})}`);
    if (!rawText && finishReason) {
      console.warn(`[google-llm] empty response, full candidate:`, JSON.stringify(candidate).slice(0, 500));
    }
    const openaiBody = buildOpenAIResponse(googleData);
    return new Response(openaiBody, {
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
    });
  }
}
