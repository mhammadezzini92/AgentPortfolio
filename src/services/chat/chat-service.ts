import "server-only";
import { chatEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { ChatOutcome } from "@/models/schemas";
import { recordChatQuestion } from "@/services/chat/chat-question-repository";
import { loadProfileCard } from "@/services/chat/profile-card";
import { type ChatTurn, type SourceReference, buildAnswerMessages } from "@/services/llm/answer-prompt";
import { streamAnswer } from "@/services/llm/answer";
import { searchKnowledge } from "@/services/retrieval/retrieval-service";

export type ChatEvent =
  | { type: "sources"; sources: SourceReference[] }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

type ChatInput = { history: ChatTurn[]; question: string };

export const NO_CONTEXT_REPLY =
  "I don't have any information about that yet. The portfolio's knowledge base is still being filled in, so try asking about experience, projects or skills.";

const FAILURE_MESSAGE = "Something went wrong while answering. Please try again in a moment.";

// Follow-ups like "what stack did it use?" carry no topic words of their own; adding the
// previous user question keeps retrieval on the same subject without an extra model call.
export function retrievalQuery(history: ChatTurn[], question: string): string {
  const previous = history.findLast((turn) => turn.role === "user");
  return previous ? `${question} ${previous.content}` : question;
}

async function generate(input: ChatInput, emit: (event: ChatEvent) => void, signal: AbortSignal) {
  const env = chatEnv();
  const [chunks, card] = await Promise.all([
    searchKnowledge(retrievalQuery(input.history, input.question), {
      topK: env.RETRIEVAL_TOP_K,
      maxContextChars: env.RETRIEVAL_MAX_CONTEXT_CHARS,
    }),
    loadProfileCard(),
  ]);

  if (chunks.length === 0 && !card) {
    emit({ type: "sources", sources: [] });
    emit({ type: "delta", text: NO_CONTEXT_REPLY });
    return { outcome: "no_context" as const, chunkCount: 0, llmUsageId: null };
  }

  const { messages, sources } = buildAnswerMessages({
    ownerName: card?.ownerName ?? null,
    profileCard: card?.text ?? null,
    chunks,
    history: input.history,
    question: input.question,
  });
  emit({ type: "sources", sources });
  const llmUsageId = await streamAnswer({ messages, signal, onDelta: (text) => emit({ type: "delta", text }) });
  return { outcome: "answered" as const, chunkCount: chunks.length, llmUsageId };
}

// Never throws: failures become an "error" event for the visitor and a log entry for the admin.
export async function runChat(input: ChatInput, emit: (event: ChatEvent) => void, signal: AbortSignal): Promise<void> {
  const startedAt = Date.now();
  let record: { outcome: ChatOutcome; chunkCount: number; llmUsageId: number | null };
  try {
    record = await generate(input, emit, signal);
    emit({ type: "done" });
  } catch (error) {
    if (!signal.aborted) {
      logger.error("Chat answer failed", { error });
      emit({ type: "error", message: FAILURE_MESSAGE });
    }
    record = { outcome: "failed", chunkCount: 0, llmUsageId: null };
  }

  // The visitor already has their answer, so a failed analytics write is logged, not surfaced.
  await recordChatQuestion({
    question: input.question,
    retrievedChunkCount: record.chunkCount,
    outcome: record.outcome,
    llmUsageId: record.llmUsageId,
    latencyMs: Date.now() - startedAt,
  }).catch((error: unknown) => logger.warn("Chat question not recorded", { error }));
}
