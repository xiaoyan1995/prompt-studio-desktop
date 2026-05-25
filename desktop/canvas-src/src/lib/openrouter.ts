/**
 * Shared OpenRouter chat-completions configuration.
 * Used by storyboard adapters, director planner, and text generation.
 */

const OPENROUTER_BASE_URL = "https://openrouter.ai/api";

export function getOpenRouterConfig() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }
  return {
    url: `${OPENROUTER_BASE_URL}/v1/chat/completions`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  };
}
