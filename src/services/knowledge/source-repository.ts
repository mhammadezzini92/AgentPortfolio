import "server-only";
import { and, desc, eq, lt, ne, or, sql } from "drizzle-orm";
import { type DbExecutor, db } from "@/lib/db";
import {
  type KnowledgeSource,
  type NewKnowledgeSource,
  ingestionJobs,
  knowledgeChunks,
  knowledgeSources,
} from "@/models/schemas";

// A source counts as busy while processing, unless its run outlived any possible function
// lifetime (the instance was killed mid-run); then it can be claimed again.
const isIdle = (staleBefore: Date) =>
  or(ne(knowledgeSources.status, "processing"), lt(knowledgeSources.updatedAt, staleBefore));

export async function insertSource(values: NewKnowledgeSource): Promise<KnowledgeSource> {
  const [source] = await db.insert(knowledgeSources).values(values).returning();
  return source;
}

export async function setSourceStoragePath(id: number, storagePath: string): Promise<void> {
  await db.update(knowledgeSources).set({ storagePath }).where(eq(knowledgeSources.id, id));
}

export async function findSourceById(id: number): Promise<KnowledgeSource | undefined> {
  return db.query.knowledgeSources.findFirst({ where: eq(knowledgeSources.id, id) });
}

export async function findOtherSourceIdByContentHash(contentHash: string, excludeId: number): Promise<number | undefined> {
  const row = await db
    .select({ id: knowledgeSources.id })
    .from(knowledgeSources)
    .where(and(eq(knowledgeSources.contentHash, contentHash), ne(knowledgeSources.id, excludeId)))
    .get();
  return row?.id;
}

// Single statement so two concurrent reprocess requests can't both start a run.
export async function claimSourceForProcessing(id: number, staleBefore: Date): Promise<KnowledgeSource | undefined> {
  const [claimed] = await db
    .update(knowledgeSources)
    .set({ status: "processing" })
    .where(and(eq(knowledgeSources.id, id), isIdle(staleBefore)))
    .returning();
  return claimed;
}

export async function setSourceStatus(
  executor: DbExecutor,
  id: number,
  status: KnowledgeSource["status"],
  fields: Partial<Pick<KnowledgeSource, "contentHash" | "title" | "lastFetchedAt">> = {},
): Promise<void> {
  await executor.update(knowledgeSources).set({ status, ...fields }).where(eq(knowledgeSources.id, id));
}

// Only for rolling back a source that never got as far as processing.
export async function deleteSourceRow(id: number): Promise<void> {
  await db.delete(knowledgeSources).where(eq(knowledgeSources.id, id));
}

export async function deleteIdleSource(executor: DbExecutor, id: number, staleBefore: Date): Promise<KnowledgeSource | undefined> {
  const [deleted] = await executor
    .delete(knowledgeSources)
    .where(and(eq(knowledgeSources.id, id), isIdle(staleBefore)))
    .returning();
  return deleted;
}

const latestJobId = sql<number | null>`(
  select max(${ingestionJobs.id}) from ${ingestionJobs} where ${ingestionJobs.sourceId} = ${knowledgeSources.id}
)`;
const chunkCount = sql<number>`(
  select count(*) from ${knowledgeChunks} where ${knowledgeChunks.sourceId} = ${knowledgeSources.id}
)`.mapWith(Number);

export async function listSourcesWithLatestJob() {
  return db
    .select({
      source: knowledgeSources,
      chunkCount,
      latestJob: {
        id: ingestionJobs.id,
        status: ingestionJobs.status,
        errorMessage: ingestionJobs.errorMessage,
        startedAt: ingestionJobs.startedAt,
        completedAt: ingestionJobs.completedAt,
      },
    })
    .from(knowledgeSources)
    .leftJoin(ingestionJobs, eq(ingestionJobs.id, latestJobId))
    .orderBy(desc(knowledgeSources.createdAt));
}

export async function countChunksForSource(sourceId: number): Promise<number> {
  const row = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.sourceId, sourceId))
    .get();
  return row?.count ?? 0;
}
