import { z } from "zod";
import type { ChatTurn } from "@/services/llm/answer-prompt";

// History lives in the visitor's browser, so a client can send anything here. These caps
// bound prompt size and cost; forged assistant turns only affect that visitor's own
// conversation, and the system prompt still governs the answer.
const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_TURN_CHARS = 1500;
const MAX_MESSAGES = 50;
const MAX_MESSAGE_CHARS = 8000;

export const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
      }),
    )
    .min(1)
    .max(MAX_MESSAGES),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ParsedChat = { ok: true; question: string; history: ChatTurn[] } | { ok: false; error: string };

export function parseChatRequest(request: ChatRequest, maxQuestionChars: number): ParsedChat {
  const last = request.messages.at(-1);
  if (!last || last.role !== "user") return { ok: false, error: "The last message must be the visitor's question" };
  if (last.content.length > maxQuestionChars) {
    return { ok: false, error: `Questions are limited to ${maxQuestionChars} characters` };
  }

  const history = request.messages
    .slice(0, -1)
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, MAX_HISTORY_TURN_CHARS) }));
  return { ok: true, question: last.content, history };
}
