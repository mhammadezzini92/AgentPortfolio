import { after } from "next/server";
import { chatEnv } from "@/lib/env";
import { jsonError } from "@/lib/http";
import { logger } from "@/lib/logger";
import { clientIp, consumeRateLimit, deleteExpiredRateLimits } from "@/lib/rate-limit";
import { deleteExpiredChatQuestions } from "@/services/chat/chat-question-repository";
import { chatRequestSchema, parseChatRequest } from "@/services/chat/chat-request";
import { type ChatEvent, runChat } from "@/services/chat/chat-service";

export const maxDuration = 60;

const MINUTE = 60;
const DAY = 24 * 60 * 60;
// Cleanup piggybacks on a small share of chat requests instead of needing a cron job.
const CLEANUP_PROBABILITY = 0.02;

async function checkRateLimits(ip: string): Promise<Response | null> {
  const env = chatEnv();
  const windows = [
    { key: `chat:minute:${ip}`, limit: env.CHAT_RATE_LIMIT_PER_MINUTE, seconds: MINUTE, message: "Too many questions; wait a moment" },
    { key: `chat:day:${ip}`, limit: env.CHAT_RATE_LIMIT_PER_DAY, seconds: DAY, message: "Daily question limit reached" },
    { key: "chat:global:day", limit: env.CHAT_GLOBAL_DAILY_LIMIT, seconds: DAY, message: "The assistant is resting for today; try again tomorrow" },
  ];
  // Sequential so a request rejected by the per-IP limits doesn't spend the global budget.
  for (const window of windows) {
    const decision = await consumeRateLimit(window.key, window.limit, window.seconds);
    if (!decision.allowed) return jsonError(429, window.message, { retryAfterSeconds: decision.retryAfterSeconds });
  }
  return null;
}

function scheduleCleanup() {
  if (Math.random() >= CLEANUP_PROBABILITY) return;
  after(async () => {
    const results = await Promise.allSettled([deleteExpiredRateLimits(), deleteExpiredChatQuestions()]);
    for (const failed of results.filter((result) => result.status === "rejected")) {
      logger.warn("Chat cleanup failed", { error: failed.reason });
    }
  });
}

export async function POST(request: Request) {
  const body = chatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Expected { messages: [{ role, content }] }");

  const parsed = parseChatRequest(body.data, chatEnv().CHAT_MAX_INPUT_CHARS);
  if (!parsed.ok) return jsonError(400, parsed.error);

  const limited = await checkRateLimits(clientIp(request));
  if (limited) return limited;
  scheduleCleanup();

  const encoder = new TextEncoder();
  // Writing to a stream the visitor already cancelled throws, so writes stop once it's closed.
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatEvent) => {
        if (open) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      await runChat({ question: parsed.question, history: parsed.history }, emit, request.signal);
      if (open) controller.close();
      open = false;
    },
    cancel() {
      open = false;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
