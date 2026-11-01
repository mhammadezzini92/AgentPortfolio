import { describe, expect, it } from "vitest";
import { chatRequestSchema, parseChatRequest } from "@/services/chat/chat-request";

const turn = (role: "user" | "assistant", content: string) => ({ role, content });

describe("chat request parsing", () => {
  it("splits the latest question from the history", () => {
    const parsed = parseChatRequest({ messages: [turn("user", "Hi"), turn("assistant", "Hello"), turn("user", "Projects?")] }, 1000);
    expect(parsed).toEqual({ ok: true, question: "Projects?", history: [turn("user", "Hi"), turn("assistant", "Hello")] });
  });

  it("requires the last message to come from the visitor", () => {
    expect(parseChatRequest({ messages: [turn("user", "Hi"), turn("assistant", "Hello")] }, 1000)).toMatchObject({ ok: false });
  });

  it("enforces the question length limit", () => {
    expect(parseChatRequest({ messages: [turn("user", "x".repeat(1001))] }, 1000)).toEqual({
      ok: false,
      error: "Questions are limited to 1000 characters",
    });
  });

  it("keeps only the last six history turns and truncates long ones", () => {
    const history = Array.from({ length: 10 }, (_, i) => turn(i % 2 === 0 ? "user" : "assistant", `${i}:${"y".repeat(3000)}`));
    const parsed = parseChatRequest({ messages: [...history, turn("user", "Now?")] }, 1000);
    if (!parsed.ok) throw new Error(parsed.error);

    expect(parsed.history).toHaveLength(6);
    expect(parsed.history[0].content.startsWith("4:")).toBe(true);
    expect(parsed.history.every((entry) => entry.content.length === 1500)).toBe(true);
  });

  it("rejects unknown roles, empty messages and oversized bodies at the schema", () => {
    expect(chatRequestSchema.safeParse({ messages: [{ role: "system", content: "x" }] }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages: [{ role: "user", content: "   " }] }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages: [] }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages: Array.from({ length: 51 }, () => turn("user", "x")) }).success).toBe(false);
  });
});
