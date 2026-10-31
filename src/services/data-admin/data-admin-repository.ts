import "server-only";
import { type SQL, and, asc, desc, eq, like, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  type EntityType,
  experiences,
  knowledgeChunks,
  knowledgeSources,
  profile,
  projects,
  sourceRelationships,
} from "@/models/schemas";
import type { ChunkEdit, ExperienceEdit, ProfileEdit, ProjectEdit, SourceEdit } from "@/services/data-admin/edit-schemas";
import type { DataTableSpec } from "@/services/data-admin/table-specs";
import { sha256Hex } from "@/utils/text";

export type TableRow = Record<string, unknown>;

function filterCondition(spec: DataTableSpec, filter: string): SQL | undefined {
  if (!filter) return undefined;
  return or(...spec.searchColumns.map((column) => like(column, `%${filter}%`)));
}

export async function listTableRows(spec: DataTableSpec, page: number, pageSize: number, filter: string) {
  const where = filterCondition(spec, filter);
  const [rows, total] = await Promise.all([
    db.select().from(spec.table).where(where).orderBy(desc(spec.orderBy)).limit(pageSize).offset((page - 1) * pageSize),
    db.$count(spec.table, where),
  ]);
  return { rows: rows as TableRow[], total };
}

export async function countTableRows(spec: DataTableSpec): Promise<number> {
  return db.$count(spec.table);
}

export async function listProjectOptions(): Promise<{ id: number; name: string }[]> {
  return db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name));
}

export async function findEditableRow(tableName: string, id: number): Promise<TableRow | undefined> {
  switch (tableName) {
    case "profile":
      return id === 1 ? db.select().from(profile).where(eq(profile.id, 1)).get() : undefined;
    case "projects":
      return db.select().from(projects).where(eq(projects.id, id)).get();
    case "experiences":
      return db.select().from(experiences).where(eq(experiences.id, id)).get();
    case "knowledge_chunks":
      return db.select().from(knowledgeChunks).where(eq(knowledgeChunks.id, id)).get();
    case "knowledge_sources":
      return db.select().from(knowledgeSources).where(eq(knowledgeSources.id, id)).get();
    default:
      return undefined;
  }
}

// updated_at is stored in whole seconds, which is what the edit form echoes back.
const asTimestamp = (unixSeconds: number) => new Date(unixSeconds * 1000);

// Each update matches on the expected updated_at in the same statement, so the check
// and the write are atomic. false means the row is gone or changed since it was read.
export async function updateProfileIfUnchanged(values: ProfileEdit, expectedUpdatedAt: number): Promise<boolean> {
  const updated = await db
    .update(profile)
    .set({ ...values, manuallyEditedAt: new Date() })
    .where(and(eq(profile.id, 1), eq(profile.updatedAt, asTimestamp(expectedUpdatedAt))))
    .returning({ id: profile.id });
  return updated.length > 0;
}

export async function insertProfileIfAbsent(values: ProfileEdit): Promise<boolean> {
  const inserted = await db
    .insert(profile)
    .values({ ...values, id: 1, manuallyEditedAt: new Date() })
    .onConflictDoNothing()
    .returning({ id: profile.id });
  return inserted.length > 0;
}

export async function updateProjectIfUnchanged(id: number, values: ProjectEdit, expectedUpdatedAt: number): Promise<boolean> {
  const updated = await db
    .update(projects)
    .set({ ...values, manuallyEditedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.updatedAt, asTimestamp(expectedUpdatedAt))))
    .returning({ id: projects.id });
  return updated.length > 0;
}

export async function insertProject(values: ProjectEdit): Promise<number> {
  const [inserted] = await db.insert(projects).values({ ...values, manuallyEditedAt: new Date() }).returning({ id: projects.id });
  return inserted.id;
}

export async function updateExperienceIfUnchanged(id: number, values: ExperienceEdit, expectedUpdatedAt: number): Promise<boolean> {
  const updated = await db
    .update(experiences)
    .set({ ...values, manuallyEditedAt: new Date() })
    .where(and(eq(experiences.id, id), eq(experiences.updatedAt, asTimestamp(expectedUpdatedAt))))
    .returning({ id: experiences.id });
  return updated.length > 0;
}

export async function insertExperience(values: ExperienceEdit): Promise<number> {
  const [inserted] = await db.insert(experiences).values({ ...values, manuallyEditedAt: new Date() }).returning({ id: experiences.id });
  return inserted.id;
}

// Chunks have no updated_at; a reprocess replaces them with new ids, so a stale form
// simply finds nothing to update. The FTS update trigger reindexes content and heading.
export async function updateChunk(id: number, values: ChunkEdit): Promise<boolean> {
  const updated = await db
    .update(knowledgeChunks)
    .set({ ...values, contentHash: sha256Hex(values.content) })
    .where(eq(knowledgeChunks.id, id))
    .returning({ id: knowledgeChunks.id });
  return updated.length > 0;
}

export async function updateSourceIfUnchanged(id: number, values: SourceEdit, expectedUpdatedAt: number): Promise<boolean> {
  const updated = await db
    .update(knowledgeSources)
    .set(values)
    .where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.updatedAt, asTimestamp(expectedUpdatedAt))))
    .returning({ id: knowledgeSources.id });
  return updated.length > 0;
}

// source_relationships points at entities polymorphically (no foreign key), so the links
// go in the same transaction; chunks keep their text and lose the project via ON DELETE SET NULL.
export async function deleteEntityWithLinks(entityType: Extract<EntityType, "project" | "experience">, id: number): Promise<boolean> {
  const table = entityType === "project" ? projects : experiences;
  return db.transaction(async (tx) => {
    await tx
      .delete(sourceRelationships)
      .where(and(eq(sourceRelationships.entityType, entityType), eq(sourceRelationships.entityId, id)));
    const deleted = await tx.delete(table).where(eq(table.id, id)).returning({ id: table.id });
    return deleted.length > 0;
  });
}
