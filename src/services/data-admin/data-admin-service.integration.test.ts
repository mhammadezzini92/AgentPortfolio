import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { KnowledgeExtraction } from "@/services/llm/extraction-schema";

vi.mock("server-only", () => ({}));

const tempDir = mkdtempSync(join(tmpdir(), "agent-portfolio-data-admin-"));
process.env.TURSO_DATABASE_URL = `file:${join(tempDir, "test.db")}`;

// Imported after the env is set, because lib/db reads it at module load.
const { db } = await import("@/lib/db");
const { migrate } = await import("drizzle-orm/libsql/migrator");
const { knowledgeChunks, projects, sourceRelationships } = await import("@/models/schemas");
const dataAdmin = await import("@/services/data-admin/data-admin-service");
const knowledge = await import("@/services/knowledge/knowledge-service");
const sources = await import("@/services/knowledge/source-repository");
const jobs = await import("@/services/knowledge/job-repository");

const project = (overrides: Record<string, unknown> = {}) => ({
  name: "Ledger",
  description: "Extracted description",
  role: null,
  architecture: null,
  technologies: ["Go", "Kafka"],
  challenges: null,
  solutions: null,
  achievements: null,
  evidence: "Built Ledger",
  ...overrides,
});

const extraction = (projectOverrides: Record<string, unknown> = {}): KnowledgeExtraction => ({
  profile: null,
  experiences: [],
  projects: [project(projectOverrides)],
  chunkLabels: [{ chunkIndex: 0, provenance: "personal", projectName: "Ledger" }],
});

async function ingest(sourceId: number, contentHash: string, content: string, result: KnowledgeExtraction) {
  const source = await sources.findSourceById(sourceId);
  const job = await jobs.insertProcessingJob(sourceId);
  await knowledge.persistIngestion({
    source: source!,
    jobId: job.id,
    contentHash,
    title: null,
    chunks: [{ index: 0, heading: "Projects", headingPath: ["Projects"], content }],
    extraction: result,
  });
}

const ledger = async () => (await db.select().from(projects).where(eq(projects.name, "Ledger")).get())!;
const versionOf = (row: { updatedAt: Date }) => Math.floor(row.updatedAt.getTime() / 1000);
const ftsMatches = async (term: string) =>
  (await db.all<{ id: number }>(sql`select rowid as id from knowledge_chunks_fts where knowledge_chunks_fts match ${term}`)).length;

const editedLedger = {
  name: "Ledger",
  description: "My own words",
  role: "Tech lead",
  architecture: null,
  technologies: ["Go"],
  challenges: null,
  solutions: null,
  achievements: null,
};

let cvId: number;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  cvId = (await sources.insertSource({ sourceType: "cv", title: "CV" })).id;
  await ingest(cvId, "hash-1", "Built Ledger on Kafka", extraction());
});

afterAll(() => {
  db.$client.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("editing knowledge by hand", () => {
  it("saves a project edit and marks the row as hand-edited", async () => {
    const before = await ledger();
    const outcome = await dataAdmin.updateRecord("projects", before.id, { values: editedLedger, expectedUpdatedAt: versionOf(before) });

    expect(outcome).toEqual({ status: "saved", id: before.id });
    expect(await ledger()).toMatchObject({ description: "My own words", technologies: ["Go"], manuallyEditedAt: expect.any(Date) });
  });

  it("rejects a save based on a stale version and reports a missing row", async () => {
    const current = await ledger();
    expect(await dataAdmin.updateRecord("projects", current.id, { values: editedLedger, expectedUpdatedAt: versionOf(current) - 60 })).toMatchObject({
      status: "conflict",
    });
    expect(await dataAdmin.updateRecord("projects", 9999, { values: editedLedger, expectedUpdatedAt: 0 })).toEqual({ status: "not_found" });
  });

  it("keeps hand-edited values when the source is reprocessed with different content", async () => {
    await ingest(cvId, "hash-2", "Built Ledger on Kafka and Postgres", extraction({ description: "New extraction", role: "Engineer", technologies: ["Postgres"] }));
    expect(await ledger()).toMatchObject({ description: "My own words", role: "Tech lead", technologies: ["Go"] });
  });

  it("keeps a hand-edited project when its only source is deleted", async () => {
    const otherId = (await sources.insertSource({ sourceType: "cv", title: "Old CV" })).id;
    await ingest(otherId, "hash-other", "Built Atlas", { ...extraction(), projects: [project({ name: "Atlas" })], chunkLabels: [] });
    const atlas = (await db.select().from(projects).where(eq(projects.name, "Atlas")).get())!;
    await dataAdmin.updateRecord("projects", atlas.id, { values: { ...editedLedger, name: "Atlas" }, expectedUpdatedAt: versionOf(atlas) });

    expect(await knowledge.deleteSource(otherId, new Date(0))).toBe("deleted");
    expect(await db.select().from(projects).where(eq(projects.id, atlas.id)).get()).toBeDefined();
  });

  it("validates input and refuses read-only tables", async () => {
    const current = await ledger();
    const invalid = await dataAdmin.updateRecord("projects", current.id, { values: { ...editedLedger, name: "  " }, expectedUpdatedAt: versionOf(current) });
    expect(invalid.status).toBe("invalid");
    expect(await dataAdmin.updateRecord("ingestion_jobs", 1, { values: {}, expectedUpdatedAt: 0 })).toEqual({ status: "not_allowed" });
    expect(await dataAdmin.deleteRecord("knowledge_sources", cvId)).toEqual({ status: "not_allowed" });
  });

  it("reindexes an edited chunk for search and recomputes its hash", async () => {
    const chunk = (await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.sourceId, cvId)).get())!;
    const outcome = await dataAdmin.updateRecord("knowledge_chunks", chunk.id, {
      values: { provenance: "general", projectId: null, heading: "Notes", content: "Rewritten with Elixir" },
      expectedUpdatedAt: null,
    });

    expect(outcome.status).toBe("saved");
    expect(await ftsMatches("elixir")).toBe(1);
    expect(await ftsMatches("postgres")).toBe(0);
    const updated = (await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.id, chunk.id)).get())!;
    expect(updated).toMatchObject({ provenance: "general", projectId: null });
    expect(updated.contentHash).not.toBe(chunk.contentHash);
  });

  it("creates a profile once and rejects a second create", async () => {
    const values = {
      fullName: "Jane Doe", title: null, location: null, professionalSummary: null,
      skills: [], languages: [], education: [], contactInformation: { email: "jane@example.com" },
    };
    expect(await dataAdmin.createRecord("profile", values)).toEqual({ status: "saved", id: 1 });
    expect(await dataAdmin.createRecord("profile", values)).toMatchObject({ status: "conflict" });
  });

  it("deletes a project with its source links and detaches its chunks", async () => {
    const created = await dataAdmin.createRecord("projects", { ...editedLedger, name: "Scratch" });
    if (created.status !== "saved") throw new Error("create failed");
    await db.insert(sourceRelationships).values({ sourceId: cvId, entityType: "project", entityId: created.id, evidence: "x" });
    const chunk = (await db.select().from(knowledgeChunks).get())!;
    await db.update(knowledgeChunks).set({ projectId: created.id }).where(eq(knowledgeChunks.id, chunk.id));

    expect(await dataAdmin.deleteRecord("projects", created.id)).toEqual({ status: "saved", id: created.id });
    expect(await db.select().from(sourceRelationships).where(eq(sourceRelationships.entityId, created.id)).all()).toHaveLength(0);
    expect((await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.id, chunk.id)).get())!.projectId).toBeNull();
    expect(await dataAdmin.deleteRecord("projects", created.id)).toEqual({ status: "not_found" });
  });
});
