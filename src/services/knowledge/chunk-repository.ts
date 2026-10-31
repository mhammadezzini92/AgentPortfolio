import "server-only";
import { asc, eq } from "drizzle-orm";
import { type Transaction, db } from "@/lib/db";
import { type KnowledgeChunk, type NewKnowledgeChunk, knowledgeChunks } from "@/models/schemas";

export async function listChunksForSource(sourceId: number): Promise<KnowledgeChunk[]> {
  return db.select().from(knowledgeChunks).where(eq(knowledgeChunks.sourceId, sourceId)).orderBy(asc(knowledgeChunks.chunkIndex));
}

// Keeps each INSERT well under SQLite's bound-parameter limit (10 columns per row).
const INSERT_BATCH_SIZE = 100;

// Delete-then-insert inside the caller's transaction; the FTS triggers keep the index in step.
export async function replaceSourceChunks(tx: Transaction, sourceId: number, chunks: NewKnowledgeChunk[]): Promise<void> {
  await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, sourceId));
  for (let start = 0; start < chunks.length; start += INSERT_BATCH_SIZE) {
    await tx.insert(knowledgeChunks).values(chunks.slice(start, start + INSERT_BATCH_SIZE));
  }
}
