import "server-only";
import { eq } from "drizzle-orm";
import { type DbExecutor, type Transaction, db } from "@/lib/db";
import { type SuppressibleEntityType, entitySuppressions } from "@/models/schemas";

// "project:<key>" / "experience:<key>" entries, checked once per ingestion.
export type SuppressedKeys = Set<string>;

export const suppressionId = (entityType: SuppressibleEntityType, matchKey: string) => `${entityType}:${matchKey}`;

export async function listSuppressedKeys(executor: DbExecutor): Promise<SuppressedKeys> {
  const rows = await executor.select({ entityType: entitySuppressions.entityType, matchKey: entitySuppressions.matchKey }).from(entitySuppressions);
  return new Set(rows.map((row) => suppressionId(row.entityType, row.matchKey)));
}

export async function insertSuppression(
  tx: Transaction,
  suppression: { entityType: SuppressibleEntityType; matchKey: string; label: string },
): Promise<void> {
  await tx.insert(entitySuppressions).values(suppression).onConflictDoNothing();
}

export async function deleteSuppression(id: number): Promise<boolean> {
  const deleted = await db.delete(entitySuppressions).where(eq(entitySuppressions.id, id)).returning({ id: entitySuppressions.id });
  return deleted.length > 0;
}
