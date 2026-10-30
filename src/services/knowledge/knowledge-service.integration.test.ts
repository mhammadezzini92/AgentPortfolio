import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DocumentChunk } from "@/services/ingestion/chunker";
import type { KnowledgeExtraction } from "@/services/llm/extraction-schema";

vi.mock("server-only", () => ({}));

const tempDir = mkdtempSync(join(tmpdir(), "agent-portfolio-test-"));
process.env.TURSO_DATABASE_URL = `file:${join(tempDir, "test.db")}`;

// Imported after the env is set, because lib/db reads it at module load.
const { db } = await import("@/lib/db");
const { migrate } = await import("drizzle-orm/libsql/migrator");
const knowledge = await import("@/services/knowledge/knowledge-service");
const sources = await import("@/services/knowledge/source-repository");
const jobs = await import("@/services/knowledge/job-repository");
const ingestion = await import("@/services/ingestion/ingestion-service");
const { consumeRateLimit } = await import("@/lib/rate-limit");

const noEntities: KnowledgeExtraction = { profile: null, experiences: [], projects: [], chunkLabels: [] };

const ledgerProject = (technologies: string[]) => ({
  name: "Ledger",
  description: null,
  role: null,
  architecture: null,
  technologies,
  challenges: null,
  solutions: null,
  achievements: null,
  evidence: "Built Ledger",
});

const chunk = (index: number, content: string): DocumentChunk => ({ index, heading: "Projects", headingPath: ["Projects"], content });

async function ingest(sourceId: number, contentHash: string, chunks: DocumentChunk[], extraction: KnowledgeExtraction) {
  const source = await sources.findSourceById(sourceId);
  const job = await jobs.insertProcessingJob(sourceId);
  await knowledge.persistIngestion({ source: source!, jobId: job.id, contentHash, title: null, chunks, extraction });
}

const count = async (table: string) =>
  (await db.get<{ n: number }>(sql.raw(`select count(*) as n from ${table}`))).n;

const search = async (term: string) =>
  db.all<{ id: number }>(sql`select rowid as id from knowledge_chunks_fts where knowledge_chunks_fts match ${term}`);

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
});

afterAll(() => {
  db.$client.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("knowledge persistence", () => {
  let cvId: number;
  let portfolioId: number;

  it("persists chunks, entities and links in one run, searchable through FTS", async () => {
    cvId = (await sources.insertSource({ sourceType: "cv", title: "CV" })).id;
    await ingest(cvId, "hash-cv", [chunk(0, "Built Ledger with Kafka"), chunk(1, "Speaks Arabic")], {
      profile: {
        fullName: "Jane Doe", title: null, professionalSummary: null, location: null, skills: ["Go"],
        languages: [], education: [],
        contactInformation: { email: null, phone: null, website: null, linkedin: null, github: null },
        evidence: "Jane Doe",
      },
      experiences: [],
      projects: [ledgerProject(["Go"])],
      chunkLabels: [{ chunkIndex: 0, provenance: "personal", projectName: "Ledger" }],
    });

    const source = await sources.findSourceById(cvId);
    expect(source).toMatchObject({ status: "completed", contentHash: "hash-cv" });
    expect(await count("projects")).toBe(1);
    expect(await count("profile")).toBe(1);
    expect(await search("kafka")).toHaveLength(1);

    const linked = await db.get<{ project_id: number | null }>(sql`select project_id from knowledge_chunks where chunk_index = 0`);
    expect(linked.project_id).not.toBeNull();
  });

  it("merges the same project from a second source instead of duplicating it", async () => {
    portfolioId = (await ingestion.createUrlSource(new URL("https://Jane.dev"), "portfolio", null)).id;
    await ingest(portfolioId, "hash-portfolio", [chunk(0, "Ledger case study")], { ...noEntities, projects: [ledgerProject(["Kafka"])] });

    expect(await count("projects")).toBe(1);
    const project = await db.get<{ technologies: string }>(sql`select technologies from projects`);
    expect(JSON.parse(project.technologies)).toEqual(["Go", "Kafka"]);
  });

  it("keeps facts another source supports when a source is deleted", async () => {
    expect(await knowledge.deleteSource(cvId, ingestion.staleProcessingCutoff())).toBe("deleted");

    expect(await count("projects")).toBe(1);
    expect(await count("profile")).toBe(0);
    expect(await search("kafka")).toHaveLength(0);
    expect(await search("ledger")).toHaveLength(1);
  });

  it("removes entities a reprocessed source no longer supports", async () => {
    await ingest(portfolioId, "hash-portfolio-v2", [chunk(0, "Now about something else")], noEntities);
    expect(await count("projects")).toBe(0);
    expect(await search("ledger")).toHaveLength(0);
  });

  it("reports not_found and busy distinctly", async () => {
    expect(await knowledge.deleteSource(999_999, ingestion.staleProcessingCutoff())).toBe("not_found");

    const claim = await ingestion.claimSourceForIngestion(portfolioId);
    expect(claim.status).toBe("claimed");
    expect((await ingestion.claimSourceForIngestion(portfolioId)).status).toBe("busy");
    expect(await knowledge.deleteSource(portfolioId, ingestion.staleProcessingCutoff())).toBe("busy");
  });

  it("rejects a second source with the same canonical URL", async () => {
    await expect(ingestion.createUrlSource(new URL("https://jane.dev/#projects"), "portfolio", null)).rejects.toBeInstanceOf(
      ingestion.DuplicateSourceError,
    );
  });
});

describe("consumeRateLimit", () => {
  it("allows up to the limit within a window, then blocks", async () => {
    const decisions = [];
    for (let i = 0; i < 4; i++) decisions.push(await consumeRateLimit("test:ip", 3, 60));

    expect(decisions.map((d) => d.allowed)).toEqual([true, true, true, false]);
    expect(decisions[3].retryAfterSeconds).toBeGreaterThan(0);
  });
});
