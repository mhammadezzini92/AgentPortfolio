import "server-only";
import OpenAI from "openai";
import { openRouterEnv } from "@/lib/env";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

let client: OpenAI | null = null;

// OpenRouter speaks the OpenAI Chat Completions protocol, so the official SDK is reused.
export function getLlmClient(): OpenAI {
  client ??= new OpenAI({
    apiKey: openRouterEnv().OPENROUTER_API_KEY,
    baseURL: OPENROUTER_BASE_URL,
    maxRetries: 2,
    timeout: 90_000,
    defaultHeaders: { "X-Title": "AgentPortfolio" },
  });
  return client;
}

// OpenRouter-only request fields. require_parameters stops it from routing to a provider
// that would silently ignore response_format; usage.include returns the billed cost.
export const OPENROUTER_REQUEST_FIELDS = {
  provider: { require_parameters: true },
  usage: { include: true },
} as const;

export type OpenRouterUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  cost?: number;
};
