import "server-only";
import { desc, eq } from "drizzle-orm";
import { type DbExecutor, db } from "@/lib/db";
import { type IngestionJob, ingestionJobs } from "@/models/schemas";

const MAX_ERROR_LENGTH = 2000;

export async function insertProcessingJob(sourceId: number): Promise<IngestionJob> {
  const [job] = await db
    .insert(ingestionJobs)
    .values({ sourceId, status: "processing", startedAt: new Date() })
    .returning();
  return job;
}

export async function completeJob(executor: DbExecutor, id: number): Promise<void> {
  await executor
    .update(ingestionJobs)
    .set({ status: "completed", completedAt: new Date(), errorMessage: null })
    .where(eq(ingestionJobs.id, id));
}

export async function failJob(executor: DbExecutor, id: number, errorMessage: string): Promise<void> {
  await executor
    .update(ingestionJobs)
    .set({ status: "failed", completedAt: new Date(), errorMessage: errorMessage.slice(0, MAX_ERROR_LENGTH) })
    .where(eq(ingestionJobs.id, id));
}

export async function listJobsForSource(sourceId: number): Promise<IngestionJob[]> {
  return db
    .select()
    .from(ingestionJobs)
    .where(eq(ingestionJobs.sourceId, sourceId))
    .orderBy(desc(ingestionJobs.id))
    .limit(20);
}
