import "server-only";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { chatEnv, openRouterEnv } from "@/lib/env";
import { OPENROUTER_REQUEST_FIELDS, type OpenRouterUsage, getLlmClient } from "@/services/llm/llm-client";
import { recordLlmUsage } from "@/services/llm/usage-repository";

const ANSWER_TEMPERATURE = 0.3;

type StreamAnswerInput = {
  messages: ChatCompletionMessageParam[];
  onDelta: (text: string) => void;
  signal: AbortSignal;
};

// Returns the llm_usage row id, or null when the provider sent no usage (for example,
// when the visitor disconnected before the final chunk arrived).
export async function streamAnswer(input: StreamAnswerInput): Promise<number | null> {
  const { OPENROUTER_ANSWER_MODEL } = openRouterEnv();
  // Assigned to a variable so the OpenRouter-only fields pass TypeScript's excess-property check.
  const request = {
    model: OPENROUTER_ANSWER_MODEL,
    temperature: ANSWER_TEMPERATURE,
    max_tokens: chatEnv().CHAT_MAX_OUTPUT_TOKENS,
    messages: input.messages,
    stream: true as const,
    stream_options: { include_usage: true },
    ...OPENROUTER_REQUEST_FIELDS,
  };

  let usage: OpenRouterUsage | undefined;
  let servedModel = OPENROUTER_ANSWER_MODEL;
  try {
    const stream = await getLlmClient().chat.completions.create(request, { signal: input.signal });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) input.onDelta(text);
      if (chunk.model) servedModel = chunk.model;
      // OpenRouter sends usage, including the billed cost, on the final chunk.
      if (chunk.usage) usage = chunk.usage as OpenRouterUsage;
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Answer request failed: ${reason}`, { cause: error });
  }

  if (!usage) return null;
  return recordLlmUsage({
    operation: "answer",
    model: servedModel,
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    costUsd: usage.cost ?? null,
  });
}
