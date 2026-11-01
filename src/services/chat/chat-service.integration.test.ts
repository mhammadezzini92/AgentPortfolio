import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const streamAnswer = vi.fn();
vi.mock("@/services/llm/answer", () => ({ streamAnswer }));

const tempDir = mkdtempSync(join(tmpdir(), "agent-portfolio-chat-"));
process.env.TURSO_DATABASE_URL = `file:${join(tempDir, "test.db")}`;

// Imported after the env is set, because lib/db reads it at module load.
const { db } = await import("@/lib/db");
const { migrate } = await import("drizzle-orm/libsql/migrator");
const { chatQuestions, knowledgeChunks, knowledgeSources, llmUsage, profile } = await import("@/models/schemas");
const { NO_CONTEXT_REPLY, retrievalQuery, runChat } = await import("@/services/chat/chat-service");
type ChatEvent = import("@/services/chat/chat-service").ChatEvent;

async function chat(question: string, history: { role: "user" | "assistant"; content: string }[] = []) {
  const events: ChatEvent[] = [];
  await runChat({ question, history }, (event) => events.push(event), new AbortController().signal);
  return events;
}

const lastQuestion = async () => (await db.select().from(chatQuestions).all()).at(-1)!;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});

beforeEach(() => {
  streamAnswer.mockReset();
});

afterAll(() => {
  db.$client.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("runChat", () => {
  it("answers from a fixed reply without calling the model when the knowledge base is empty", async () => {
    const events = await chat("What has she built?");

    expect(streamAnswer).not.toHaveBeenCalled();
    expect(events).toEqual([{ type: "sources", sources: [] }, { type: "delta", text: NO_CONTEXT_REPLY }, { type: "done" }]);
    expect(await lastQuestion()).toMatchObject({ question: "What has she built?", outcome: "no_context", retrievedChunkCount: 0, llmUsageId: null });
  });

  it("streams a grounded answer and records the question with its usage row", async () => {
    const [{ id: sourceId }] = await db.insert(knowledgeSources).values({ sourceType: "cv", title: "CV", status: "completed" }).returning();
    await db.insert(knowledgeChunks).values({
      sourceId, content: "Built Ledger on Kafka.", heading: "Ledger", chunkIndex: 0, provenance: "personal", contentHash: "h", metadata: {},
    });
    await db.insert(profile).values({ id: 1, fullName: "Jane Doe" });
    const [{ id: usageId }] = await db.insert(llmUsage).values({ operation: "answer", model: "m", inputTokens: 1, outputTokens: 1 }).returning();
    streamAnswer.mockImplementation(async ({ onDelta }: { onDelta: (text: string) => void }) => {
      onDelta("Jane built ");
      onDelta("Ledger [S1].");
      return usageId;
    });

    const events = await chat("Tell me about Kafka");

    expect(events).toEqual([
      { type: "sources", sources: [{ id: "S1", title: "CV", type: "cv", url: null }] },
      { type: "delta", text: "Jane built " },
      { type: "delta", text: "Ledger [S1]." },
      { type: "done" },
    ]);
    const prompt = streamAnswer.mock.calls[0][0].messages.at(-1).content as string;
    expect(prompt).toContain("Built Ledger on Kafka.");
    expect(prompt).toContain("Name: Jane Doe");
    expect(await lastQuestion()).toMatchObject({ outcome: "answered", retrievedChunkCount: 1, llmUsageId: usageId });
  });

  it("calls the model with only the profile when nothing matches", async () => {
    streamAnswer.mockResolvedValue(null);
    await chat("Who is she?");
    expect(streamAnswer).toHaveBeenCalledOnce();
    expect(await lastQuestion()).toMatchObject({ outcome: "answered", retrievedChunkCount: 0 });
  });

  it("turns a model failure into a generic error event and a failed record", async () => {
    streamAnswer.mockRejectedValue(new Error("upstream 500 with secret details"));
    const events = await chat("Kafka?");

    expect(events.at(-1)).toEqual({ type: "error", message: expect.not.stringContaining("secret") });
    expect(events.some((event) => event.type === "done")).toBe(false);
    expect(await lastQuestion()).toMatchObject({ outcome: "failed" });
  });
});

describe("retrievalQuery", () => {
  it("adds the previous visitor question so follow-ups stay on topic", () => {
    const history = [
      { role: "user" as const, content: "Tell me about Ledger" },
      { role: "assistant" as const, content: "Ledger is a payments system." },
    ];
    expect(retrievalQuery(history, "What stack did it use?")).toBe("What stack did it use? Tell me about Ledger");
    expect(retrievalQuery([], "Kafka?")).toBe("Kafka?");
  });
});
