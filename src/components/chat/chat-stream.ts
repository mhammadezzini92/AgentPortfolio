import type { ChatEvent } from "@/services/chat/chat-service";
import type { ChatTurn } from "@/services/llm/answer-prompt";

export type { ChatEvent, ChatTurn };

// Sends the conversation to /api/chat and yields its newline-delimited JSON events.
// Non-2xx responses (validation, rate limits) are turned into a single error event.
export async function* streamChat(messages: ChatTurn[], signal?: AbortSignal): AsyncGenerator<ChatEvent> {
  let response: Response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
      signal,
    });
  } catch {
    yield { type: "error", message: "Network error. Check your connection and try again." };
    return;
  }

  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    yield { type: "error", message: body?.error ?? `Request failed (HTTP ${response.status})` };
    return;
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += value;
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line) as ChatEvent;
    }
  }
  if (buffered.trim()) yield JSON.parse(buffered) as ChatEvent;
}
