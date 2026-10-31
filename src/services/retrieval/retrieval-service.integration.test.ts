import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { NewKnowledgeChunk, Provenance } from "@/models/schemas";

vi.mock("server-only", () => ({}));

const tempDir = mkdtempSync(join(tmpdir(), "agent-portfolio-retrieval-"));
process.env.TURSO_DATABASE_URL = `file:${join(tempDir, "test.db")}`;

// Imported after the env is set, because lib/db reads it at module load.
const { db } = await import("@/lib/db");
const { migrate } = await import("drizzle-orm/libsql/migrator");
const { knowledgeChunks, knowledgeSources, projects } = await import("@/models/schemas");
const { searchKnowledge } = await import("@/services/retrieval/retrieval-service");

const options = { topK: 8, maxContextChars: 10_000 };
let chunkIndex = 0;

function chunkRow(sourceId: number, content: string, heading: string | null, provenance: Provenance, projectId: number | null = null): NewKnowledgeChunk {
  return {
    sourceId,
    projectId,
    content,
    heading,
    chunkIndex: chunkIndex++,
    provenance,
    contentHash: `hash-${chunkIndex}`,
    metadata: { headingPath: heading ? ["Projects", heading] : [] },
  };
}

let cvId: number;
let articleId: number;
let ledgerId: number;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  [{ id: cvId }, { id: articleId }] = await db
    .insert(knowledgeSources)
    .values([
      { sourceType: "cv", title: "CV", status: "completed" },
      { sourceType: "article", title: "CQRS explained", sourceUrl: "https://example.com/cqrs", status: "completed" },
    ])
    .returning({ id: knowledgeSources.id });
  [{ id: ledgerId }] = await db.insert(projects).values({ name: "Ledger" }).returning({ id: projects.id });

  await db.insert(knowledgeChunks).values([
    chunkRow(cvId, "Led the migration of the billing system to an event-driven design on PostgreSQL.", "Billing platform", "personal", ledgerId),
    chunkRow(cvId, "Mentored engineers and ran hiring loops.", "Leadership", "personal"),
    chunkRow(cvId, "Wrote a small CLI tool; it mentions kafka once.", "Tooling", "personal"),
    chunkRow(cvId, "Owned the streaming pipeline end to end.", "Kafka", "personal"),
    chunkRow(articleId, "CQRS separates the write model from the read model.", "What is CQRS", "general"),
  ]);
});

afterAll(() => {
  db.$client.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("searchKnowledge", () => {
  it("matches stemmed and prefixed words, with source and project references", async () => {
    const [top] = await searchKnowledge("Has he done any migrations on Postgres?", options);

    expect(top.content).toContain("billing system");
    expect(top.provenance).toBe("personal");
    expect(top.source).toEqual({ id: cvId, type: "cv", title: "CV", url: null });
    expect(top.project).toEqual({ id: ledgerId, name: "Ledger" });
    expect(top.headingPath).toEqual(["Projects", "Billing platform"]);
    expect(top.score).toBeGreaterThan(0);
  });

  it("ranks a heading match above a passing mention in the body", async () => {
    const results = await searchKnowledge("kafka", options);
    expect(results.map((chunk) => chunk.heading)).toEqual(["Kafka", "Tooling"]);
  });

  it("returns general material for general questions", async () => {
    const [top] = await searchKnowledge("What is CQRS?", options);
    expect(top).toMatchObject({ provenance: "general", source: { id: articleId, url: "https://example.com/cqrs" } });
  });

  it("returns [] for stopword-only questions and unknown topics", async () => {
    expect(await searchKnowledge("who are you?", options)).toEqual([]);
    expect(await searchKnowledge("quantum chromodynamics", options)).toEqual([]);
  });

  it("treats FTS5 syntax in the question as plain words instead of failing", async () => {
    const hostile = ['kafka" OR heading:*', "NEAR(kafka hiring)", "-kafka", "^kafka AND NOT", "'; drop table knowledge_chunks; --"];
    for (const question of hostile) {
      await expect(searchKnowledge(question, options)).resolves.toBeInstanceOf(Array);
    }
    expect(await searchKnowledge("hiring", options)).toHaveLength(1);
  });
});
