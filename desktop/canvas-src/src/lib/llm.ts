/**
 * Shared LLM call helper with provider fallback (Google → KIE → T8Star).
 *
 * - Adds connection timeout to prevent hanging forever
 * - Google Gemini API as primary provider (direct, no proxy)
 * - Falls back to KIE / T8Star on errors
 * - KIE endpoint: https://api.kie.ai/{model}/v1/chat/completions
 */

import { callGoogleGemini, TO_GOOGLE_MODEL, useGoogleGemini } from "./google-llm";

// ── App model name → KIE model name mapping ──
const TO_KIE_MODEL: Record<string, string> = {
  "gemini-3.1-pro-preview-thinking-high": "gemini-3.1-pro",
  "gemini-2.5-flash-preview-05-20": "gemini-2.5-flash",
  "gemini-2.5-flash-thinking": "gemini-2.5-flash",
  "gpt-5-5": "gpt-5-5",
  "gpt-5.5": "gpt-5-5",
  "chatgpt-5.5": "gpt-5-5",
};

// Models that use KIE's /codex/v1/responses endpoint (non-OpenAI-compatible)
const KIE_CODEX_MODELS = new Set(["gpt-5-5"]);

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const T8STAR_BASE_URL = "https://ai.t8star.cn";
const KIE_BASE_URL = "https://api.kie.ai";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// App model name → OpenAI model name mapping
const TO_OPENAI_MODEL: Record<string, string> = {
  "gpt-5-5": "gpt-5.5",
  "gpt-5.5": "gpt-5.5",
  "chatgpt-5.5": "gpt-5.5",
};

function useOpenAI(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// App model name → OpenRouter model name mapping
const TO_OPENROUTER_MODEL: Record<string, string> = {
  "deepseek-v4-flash": "deepseek/deepseek-v4-flash",
};

export interface LlmCallOptions {
  model: string;
  messages: Array<{ role: string; content: any }>;
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  response_format?: any;
  include_thoughts?: boolean;
  /** Connection timeout in ms (default 60s) */
  timeoutMs?: number;
  /** Restrict to specific providers (e.g. ["kie"] to skip T8Star) */
  allowedProviders?: string[];
  /** Max retry attempts per provider on retryable errors (default 0 = no retry) */
  maxRetries?: number;
}

export interface LlmCallResult {
  response: Response;
  provider: string;
  model: string;
}

/**
 * Call an LLM with automatic provider fallback.
 * Returns the raw upstream Response for the route to process.
 * Throws if all providers fail.
 *
 * For non-streaming calls: if a provider returns empty content (KIE cold-start),
 * treats it as a retryable error and falls through to the next provider.
 */
export async function callLlm(options: LlmCallOptions): Promise<LlmCallResult> {
  const {
    model,
    messages,
    stream,
    max_tokens,
    temperature,
    response_format,
    include_thoughts,
    timeoutMs = 60_000,
    allowedProviders,
    maxRetries = 0,
  } = options;

  const isGemini = model.startsWith("gemini-");

  // ── Google Gemini direct API (primary for supported Gemini models) ──
  const googleAllowed = !allowedProviders || allowedProviders.includes("google");
  const googleModel = TO_GOOGLE_MODEL[model];
  if (googleAllowed && googleModel && useGoogleGemini()) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        console.log(`[llm] google retry ${attempt}/${maxRetries} after ${delayMs}ms`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
      try {
        console.log(`[llm] trying google model=${googleModel} stream=${!!stream}`);
        const googleRes = await callGoogleGemini({
          model, messages, stream, max_tokens, temperature, response_format, timeoutMs,
        });

        // For non-streaming: validate content is not empty
        if (!stream) {
          const bodyText = await googleRes.text();
          try {
            const data = JSON.parse(bodyText);
            const content = data.choices?.[0]?.message?.content;
            if (!content || content === "{}" || content.trim().length < 5) {
              const msg = `google returned empty content (${content?.length ?? 0} chars)`;
              console.warn(`[llm] ${msg}`);
              // If Google is the only allowed provider, throw instead of falling through
              if (allowedProviders && !allowedProviders.some(p => p !== "google")) {
                throw new LlmError(msg, 502);
              }
              break; // fall through to other providers
            }
          } catch (e) {
            if (e instanceof LlmError) throw e;
            /* pass through */
          }
          const reconstructed = new Response(bodyText, {
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
          });
          return { response: reconstructed, provider: "google", model: googleModel };
        }

        return { response: googleRes, provider: "google", model: googleModel };
      } catch (err: any) {
        console.warn(`[llm] google error:`, err.message?.slice(0, 200));
        if (err instanceof LlmError) throw err;
        if (attempt < maxRetries) continue;
        // If Google is the only allowed provider, throw directly
        if (allowedProviders && !allowedProviders.some(p => p !== "google")) {
          throw new LlmError(`google: ${err.message?.slice(0, 200)}`, 502);
        }
        // Fall through to other providers
      }
    }
  }

  // ── OpenAI direct API (primary for GPT 5.5) ──
  const openaiAllowed = !allowedProviders || allowedProviders.includes("openai");
  const openaiModel = TO_OPENAI_MODEL[model];
  if (openaiAllowed && openaiModel && useOpenAI()) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        console.log(`[llm] openai retry ${attempt}/${maxRetries} after ${delayMs}ms`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
      try {
        console.log(`[llm] trying openai model=${openaiModel} stream=${!!stream}`);
        const body: Record<string, any> = { model: openaiModel, messages };
        if (stream !== undefined) body.stream = stream;
        if (max_tokens !== undefined) body.max_completion_tokens = max_tokens;
        // GPT 5.5 is a reasoning model: no custom temperature, use reasoning_effort instead
        if (response_format !== undefined) body.response_format = response_format;

        const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.warn(`[llm] openai HTTP ${res.status}: ${errText.slice(0, 300)}`);
          if (res.status === 429 || res.status >= 500) {
            if (attempt < maxRetries) continue;
          }
          const msg = `openai: HTTP ${res.status}: ${errText.slice(0, 200)}`;
          if (allowedProviders && !allowedProviders.some(p => p !== "openai")) {
            throw new LlmError(msg, res.status);
          }
          break; // fall through to other providers
        }

        const ct = res.headers.get("content-type") || "unknown";
        console.log(`[llm] openai OK (${openaiModel}) content-type=${ct}`);

        // For non-streaming: validate content
        if (!stream) {
          const bodyText = await res.text();
          try {
            const data = JSON.parse(bodyText);
            const content = data.choices?.[0]?.message?.content;
            if (!content || content === "{}" || content.trim().length < 5) {
              const msg = `openai returned empty content (${content?.length ?? 0} chars)`;
              console.warn(`[llm] ${msg}`);
              if (allowedProviders && !allowedProviders.some(p => p !== "openai")) {
                throw new LlmError(msg, 502);
              }
              break;
            }
          } catch (e) {
            if (e instanceof LlmError) throw e;
          }
          const reconstructed = new Response(bodyText, {
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
          });
          return { response: reconstructed, provider: "openai", model: openaiModel };
        }

        return { response: res, provider: "openai", model: openaiModel };
      } catch (err: any) {
        console.warn(`[llm] openai error:`, err.message?.slice(0, 200));
        if (err instanceof LlmError) throw err;
        if (attempt < maxRetries) continue;
        if (allowedProviders && !allowedProviders.some(p => p !== "openai")) {
          throw new LlmError(`openai: ${err.message?.slice(0, 200)}`, 502);
        }
      }
    }
  }

  // ── Build provider list (KIE primary, T8Star fallback) ──
  interface Provider {
    name: string;
    buildUrl: (resolvedModel: string) => string;
    apiKey: string;
    resolveModel: () => string | null;
  }

  const allProviders: Provider[] = [];

  // KIE (primary for Gemini models + GPT 5.5 via codex endpoint)
  const kieKey = process.env.KIE_API_KEY;
  if (kieKey) {
    allProviders.push({
      name: "kie",
      buildUrl: (kieModel: string) => KIE_CODEX_MODELS.has(kieModel)
        ? `${KIE_BASE_URL}/codex/v1/responses`
        : `${KIE_BASE_URL}/${kieModel}/v1/chat/completions`,
      apiKey: kieKey,
      resolveModel: () => TO_KIE_MODEL[model] ?? null,
    });
  }

  // OpenRouter (for DeepSeek etc.)
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey) {
    allProviders.push({
      name: "openrouter",
      buildUrl: () => `${OPENROUTER_BASE_URL}/chat/completions`,
      apiKey: openrouterKey,
      resolveModel: () => TO_OPENROUTER_MODEL[model] ?? null,
    });
  }

  // T8Star (fallback)
  const t8starKey = isGemini
    ? (process.env.T8STAR_GEMINI_API_KEY || process.env.T8STAR_API_KEY)
    : process.env.T8STAR_API_KEY;
  if (t8starKey) {
    allProviders.push({
      name: "t8star",
      buildUrl: () => `${T8STAR_BASE_URL}/v1/chat/completions`,
      apiKey: t8starKey,
      resolveModel: () => model,
    });
  }

  // Filter providers if allowedProviders is specified
  const providers = allowedProviders
    ? allProviders.filter((p) => allowedProviders.includes(p.name))
    : allProviders;

  if (providers.length === 0) {
    throw new LlmError("No LLM provider configured (need T8STAR_API_KEY or KIE_API_KEY)", 500);
  }

  let lastError: Error | null = null;

  for (const provider of providers) {
    // Retry loop: attempt 1 + maxRetries retries
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        console.log(`[llm] ${provider.name} retry ${attempt}/${maxRetries} after ${delayMs}ms`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    const resolvedModel = provider.resolveModel();
    if (resolvedModel === null) continue; // provider doesn't support this model

    const url = provider.buildUrl(resolvedModel);

    const isCodexModel = KIE_CODEX_MODELS.has(resolvedModel);

    // Build request body: codex models use /codex/v1/responses format
    let body: Record<string, any>;
    if (isCodexModel && provider.name === "kie") {
      body = buildCodexRequestBody(resolvedModel, messages, { stream, max_tokens, response_format });
    } else {
      body = { model: resolvedModel, messages };
      if (stream !== undefined) body.stream = stream;
      if (max_tokens !== undefined) body.max_tokens = max_tokens;
      if (temperature !== undefined) body.temperature = temperature;
      if (response_format !== undefined) body.response_format = response_format;
      // KIE supports include_thoughts; default to false to save tokens
      // Also disable tool_choice to prevent model from calling KIE's built-in tools
      if (provider.name === "kie") {
        body.include_thoughts = include_thoughts ?? false;
        body.tool_choice = "none";
      }
      // OpenRouter: exclude providers with strict content filters
      if (provider.name === "openrouter") {
        body.provider = {
          ignore: ["GMICloud"],
        };
      }
    }

    try {
      console.log(`[llm] trying ${provider.name} model=${resolvedModel} stream=${!!stream}`);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok) {
        const ct = res.headers.get("content-type") || "unknown";
        console.log(`[llm] ${provider.name} OK (${resolvedModel}) content-type=${ct}`);

        // Codex models need response translation
        if (isCodexModel && provider.name === "kie") {
          if (stream) {
            // Transform codex SSE stream → OpenAI-compatible SSE stream
            const transformedStream = transformCodexStreamToOpenAI(res.body!);
            const transformedRes = new Response(transformedStream, {
              status: res.status,
              headers: new Headers({ "content-type": "text/event-stream" }),
            });
            return { response: transformedRes, provider: provider.name, model: resolvedModel };
          } else {
            // Transform codex JSON response → OpenAI-compatible JSON
            const codexBody = await res.text();
            const openaiBody = transformCodexResponseToOpenAI(codexBody);
            if (!openaiBody) {
              console.warn(`[llm] ${provider.name} codex returned empty content, trying next provider...`);
              lastError = new LlmError(`${provider.name}: empty codex content`, 502);
              continue;
            }
            const reconstructed = new Response(openaiBody, {
              status: res.status,
              headers: new Headers({ "content-type": "application/json" }),
            });
            return { response: reconstructed, provider: provider.name, model: resolvedModel };
          }
        }

        // For non-streaming: check if content is empty or content-filtered
        if (!stream) {
          const bodyText = await res.text();
          try {
            const data = JSON.parse(bodyText);
            const choice = data.choices?.[0];
            const msg = choice?.message;
            const finishReason = choice?.finish_reason;

            // content_filter = provider blocked the request (e.g. GMICloud strict filter)
            if (finishReason === "content_filter") {
              console.warn(`[llm] ${provider.name} content_filter triggered, retrying...`);
              lastError = new LlmError(`${provider.name}: content_filter`, 451);
              continue;
            }

            // Some reasoning models (DeepSeek V4 Flash) may return content in reasoning_content
            const content = msg?.content || msg?.reasoning_content;
            if (!content || content === "{}" || content.trim().length < 5) {
              console.warn(`[llm] ${provider.name} returned empty content (content=${msg?.content?.length ?? 0}, reasoning=${msg?.reasoning_content?.length ?? 0} chars, finish=${finishReason}), retrying...`);
              lastError = new LlmError(`${provider.name}: empty content`, 502);
              continue;
            }
          } catch {
            // Not JSON — pass through for caller to handle
          }
          // Reconstruct Response from consumed body text
          const reconstructed = new Response(bodyText, {
            status: res.status,
            headers: res.headers,
          });
          return { response: reconstructed, provider: provider.name, model: resolvedModel };
        }

        return { response: res, provider: provider.name, model: resolvedModel };
      }

      // Read error for logging
      const errText = await res.text().catch(() => "");
      console.warn(`[llm] ${provider.name} HTTP ${res.status}: ${errText.slice(0, 300)}`);
      lastError = new LlmError(
        `${provider.name}: HTTP ${res.status}: ${errText.slice(0, 200)}`,
        res.status,
      );

      // Retry-able errors: 429 (rate limit), 5xx (server errors)
      if (res.status === 429 || res.status >= 500) {
        if (attempt < maxRetries) continue; // retry same provider
        break; // exhausted retries, try next provider
      }

      // 4xx (except 429) = client error, don't retry with different provider
      throw lastError;
    } catch (err: any) {
      if (err instanceof LlmError) throw err; // re-throw non-retryable

      if (err.name === "TimeoutError" || err.name === "AbortError") {
        console.warn(`[llm] ${provider.name} timed out after ${timeoutMs}ms`);
        lastError = new LlmError(`${provider.name}: timeout after ${timeoutMs}ms`, 504);
        if (attempt < maxRetries) continue; // retry same provider
        break; // exhausted retries, try next provider
      }

      // Network errors
      console.warn(`[llm] ${provider.name} network error:`, err.message);
      lastError = new LlmError(`${provider.name}: ${err.message}`, 502);
      if (attempt < maxRetries) continue; // retry same provider
      break; // exhausted retries, try next provider
    }
    } // end retry loop
  }

  throw lastError || new LlmError("All LLM providers failed", 502);
}

/** Error class with HTTP status for route-level handling */
export class LlmError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "LlmError";
  }
}

// ── Token-based pricing (provider rates + 10% markup) ──
// Google Gemini 2.5 Flash: Input $0.15/M, Output $0.60/M, Thinking $3.50/M
// Google Gemini 3.1 Pro:   Input $1.25/M, Output $10.00/M, Thinking $3.50/M
// OpenAI GPT 5.5:           Input $5.00/M, Output $30.00/M
// KIE GPT 5.5:             Input $1.40/M, Output $8.40/M
interface LlmPricing { inputPerM: number; outputPerM: number; thinkingPerM?: number }
const LLM_PRICING: Record<string, LlmPricing> = {
  // Google direct pricing
  "gemini-2.5-flash":     { inputPerM: 0.15, outputPerM: 0.60, thinkingPerM: 3.50 },
  "gemini-3.1-pro-preview": { inputPerM: 1.25, outputPerM: 10.00, thinkingPerM: 3.50 },
  // OpenAI direct pricing
  "gpt-5.5":              { inputPerM: 5.00, outputPerM: 30.00 },
  // KIE pricing
  "gemini-3.1-pro":       { inputPerM: 0.50, outputPerM: 3.50 },
  "gpt-5-5":              { inputPerM: 1.40, outputPerM: 8.40 },
  // OpenRouter pricing
  "deepseek/deepseek-v4-flash": { inputPerM: 0.126, outputPerM: 0.252 },
};
const DEFAULT_PRICING: LlmPricing = { inputPerM: 0.15, outputPerM: 0.60, thinkingPerM: 3.50 };

const LLM_MARKUP = 1.10;
const XIN_USD = 0.01;

export interface LlmUsage {
  prompt_tokens: number;
  completion_tokens: number;
  thinking_tokens?: number;
  total_tokens?: number;
}

/** Calculate Xin cost from actual token usage (rate × 1.10, min 1 Xin).
 *  Pass the provider model name for model-specific pricing. */
export function calcLlmXins(usage: LlmUsage, pricingModel?: string): number {
  const p = (pricingModel && LLM_PRICING[pricingModel]) || DEFAULT_PRICING;
  const thinkingCost = (usage.thinking_tokens ?? 0) * (p.thinkingPerM ?? 0);
  const costUsd =
    ((usage.prompt_tokens * p.inputPerM +
      usage.completion_tokens * p.outputPerM +
      thinkingCost) /
      1_000_000) *
    LLM_MARKUP;
  return Math.max(1, Math.ceil(costUsd / XIN_USD));
}

/** Resolve app model name to provider model name (for pricing lookups) */
export function resolveKieModel(appModel: string): string | undefined {
  return TO_GOOGLE_MODEL[appModel] ?? TO_OPENAI_MODEL[appModel] ?? TO_KIE_MODEL[appModel] ?? TO_OPENROUTER_MODEL[appModel];
}

/** Max pre-debit per route (Xins). Actual cost refunded after stream completes. */
export const LLM_MAX_PREDEBIT: Record<string, number> = {
  "storyboard.generate": 50,
  "storyboard.prompts": 15,
  "storyboard.extract-assets": 15,
  text: 10,
};

/** Model-aware pre-debit: GPT 5.5 via OpenAI is ~10x more expensive than Gemini */
export function getPreDebit(route: string, model?: string): number {
  const base = LLM_MAX_PREDEBIT[route] ?? 15;
  if (model && (model.startsWith("gpt-5") || model.startsWith("chatgpt-5"))) {
    return Math.max(base, base * 5); // GPT 5.5 output $30/M (includes reasoning tokens)
  }
  return base;
}

// ══════════════════════════════════════════════════════════════════════════
// ── KIE Codex (/codex/v1/responses) format helpers for GPT 5.5 ──────────
// ══════════════════════════════════════════════════════════════════════════

/**
 * Convert OpenAI chat completions messages to KIE codex /v1/responses request body.
 * KIE codex uses: { model, input: [{role, content: [{type:"input_text", text}]}], reasoning, stream }
 */
function buildCodexRequestBody(
  model: string,
  messages: Array<{ role: string; content: any }>,
  opts: { stream?: boolean; max_tokens?: number; response_format?: any },
): Record<string, any> {
  // Convert messages to codex input format
  const input = messages.map((msg) => {
    const role = msg.role === "system" ? "developer" : msg.role;
    const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    return {
      role,
      content: [{ type: "input_text", text }],
    };
  });

  const body: Record<string, any> = {
    model,
    input,
    stream: opts.stream ?? false,
    reasoning: { effort: "high" },
  };

  if (opts.max_tokens) {
    body.max_output_tokens = opts.max_tokens;
  }

  // KIE codex uses text.format for response format
  if (opts.response_format?.type === "json_object") {
    body.text = { format: { type: "json_object" } };
  }

  return body;
}

/**
 * Transform a non-streaming KIE codex response into OpenAI-compatible JSON.
 * Codex response: { output: [{ type:"message", content:[{type:"output_text", text}] }], usage: {...} }
 * OpenAI format: { choices: [{ message: { role:"assistant", content:"..." } }], usage: {...} }
 */
function transformCodexResponseToOpenAI(codexBodyText: string): string | null {
  try {
    const data = JSON.parse(codexBodyText);

    // Extract text content from codex output
    let content = "";
    const outputs = data.output || [];
    for (const item of outputs) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c.type === "output_text" && c.text) {
            content += c.text;
          }
        }
      }
    }

    if (!content || content.trim().length < 5) return null;

    // Map usage fields
    const usage = data.usage
      ? {
          prompt_tokens: data.usage.input_tokens ?? 0,
          completion_tokens: data.usage.output_tokens ?? 0,
          total_tokens: data.usage.total_tokens ?? ((data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0)),
        }
      : undefined;

    const openaiResponse = {
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      ...(usage && { usage }),
    };

    return JSON.stringify(openaiResponse);
  } catch (err) {
    console.error("[llm/codex] Failed to parse codex response:", err);
    return null;
  }
}

/**
 * Transform KIE codex SSE stream into OpenAI-compatible SSE stream.
 * Codex stream events:
 *   event: response.output_text.delta  → data: { delta: "...", type: "response.output_text.delta" }
 *   event: response.completed          → data: { response: { usage: {...} } }
 * OpenAI stream format:
 *   data: {"choices":[{"delta":{"content":"..."}}]}
 *   data: [DONE]
 */
function transformCodexStreamToOpenAI(inputBody: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
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
              const outputChunks = processCodexBuffer(buffer);
              for (const chunk of outputChunks) {
                controller.enqueue(encoder.encode(chunk));
              }
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          buffer += decoder.decode(value, { stream: true });

          // Process complete lines
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // Keep incomplete last line

          const outputChunks = processCodexLines(lines);
          for (const chunk of outputChunks) {
            controller.enqueue(encoder.encode(chunk));
          }

          if (outputChunks.length > 0) return; // Yield control after producing output
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

function processCodexBuffer(buffer: string): string[] {
  return processCodexLines(buffer.split("\n"));
}

function processCodexLines(lines: string[]): string[] {
  const output: string[] = [];
  let currentEvent = "";

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("event: ")) {
      currentEvent = trimmed.slice(7);
    } else if (trimmed.startsWith("data: ")) {
      const dataStr = trimmed.slice(6);
      if (dataStr === "[DONE]") {
        output.push("data: [DONE]\n\n");
        continue;
      }

      try {
        const data = JSON.parse(dataStr);

        if (currentEvent === "response.output_text.delta" || data.type === "response.output_text.delta") {
          // Text delta → OpenAI format
          const delta = data.delta ?? "";
          if (delta) {
            const openaiChunk = { choices: [{ index: 0, delta: { content: delta } }] };
            output.push(`data: ${JSON.stringify(openaiChunk)}\n\n`);
          }
        } else if (currentEvent === "response.completed" || data.type === "response.completed") {
          // Completion with usage → emit usage in OpenAI format
          const usage = data.response?.usage ?? data.usage;
          if (usage) {
            const openaiUsage = {
              choices: [{ index: 0, delta: {} }],
              usage: {
                prompt_tokens: usage.input_tokens ?? 0,
                completion_tokens: usage.output_tokens ?? 0,
                total_tokens: usage.total_tokens ?? ((usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)),
              },
            };
            output.push(`data: ${JSON.stringify(openaiUsage)}\n\n`);
          }
        }
        // Skip other events (reasoning, etc.)
      } catch {
        // Skip unparseable data lines
      }

      currentEvent = ""; // Reset after processing data
    }
  }

  return output;
}
