import "server-only";
import { and, eq, inArray, notExists } from "drizzle-orm";
import { type DbExecutor, type Transaction, db } from "@/lib/db";
import {
  type EntityType,
  type Experience,
  type NewExperience,
  type NewProfile,
  type NewProject,
  type Profile,
  type Project,
  type SourceRelationship,
  experiences,
  profile,
  projects,
  sourceRelationships,
} from "@/models/schemas";

export async function getProfile(executor: DbExecutor): Promise<Profile | undefined> {
  return executor.select().from(profile).where(eq(profile.id, 1)).get();
}

export async function upsertProfile(tx: Transaction, values: NewProfile): Promise<void> {
  const { id, ...fields } = values;
  await tx.insert(profile).values({ ...fields, id: id ?? 1 }).onConflictDoUpdate({ target: profile.id, set: fields });
}

// Matching happens in code on normalized names; a personal portfolio holds tens of
// projects, so loading them all is cheaper than maintaining a normalized-name column.
export async function listProjects(executor: DbExecutor): Promise<Project[]> {
  return executor.select().from(projects);
}

export async function saveProject(tx: Transaction, existingId: number | undefined, values: NewProject): Promise<number> {
  if (existingId !== undefined) {
    await tx.update(projects).set(values).where(eq(projects.id, existingId));
    return existingId;
  }
  const [inserted] = await tx.insert(projects).values(values).returning({ id: projects.id });
  return inserted.id;
}

export async function listExperiences(executor: DbExecutor): Promise<Experience[]> {
  return executor.select().from(experiences);
}

export async function saveExperience(tx: Transaction, existingId: number | undefined, values: NewExperience): Promise<number> {
  if (existingId !== undefined) {
    await tx.update(experiences).set(values).where(eq(experiences.id, existingId));
    return existingId;
  }
  const [inserted] = await tx.insert(experiences).values(values).returning({ id: experiences.id });
  return inserted.id;
}

export async function listRelationshipsForSource(executor: DbExecutor, sourceId: number): Promise<SourceRelationship[]> {
  return executor.select().from(sourceRelationships).where(eq(sourceRelationships.sourceId, sourceId));
}

export async function replaceSourceRelationships(
  tx: Transaction,
  sourceId: number,
  links: { entityType: EntityType; entityId: number; evidence: string }[],
): Promise<void> {
  await tx.delete(sourceRelationships).where(eq(sourceRelationships.sourceId, sourceId));
  if (links.length > 0) {
    await tx.insert(sourceRelationships).values(links.map((link) => ({ ...link, sourceId }))).onConflictDoNothing();
  }
}

const ENTITY_TABLES = { profile, project: projects, experience: experiences } as const;

// Deletes candidates that no source supports any more. Entities still linked to another
// source are kept, which is how facts confirmed elsewhere survive a source deletion.
export async function deleteUnsupportedEntities(
  tx: Transaction,
  candidates: Pick<SourceRelationship, "entityType" | "entityId">[],
): Promise<void> {
  for (const entityType of Object.keys(ENTITY_TABLES) as EntityType[]) {
    const ids = candidates.filter((c) => c.entityType === entityType).map((c) => c.entityId);
    if (ids.length === 0) continue;

    const table = ENTITY_TABLES[entityType];
    await tx.delete(table).where(
      and(
        inArray(table.id, ids),
        notExists(
          tx
            .select({ id: sourceRelationships.id })
            .from(sourceRelationships)
            .where(and(eq(sourceRelationships.entityType, entityType), eq(sourceRelationships.entityId, table.id))),
        ),
      ),
    );
  }
}

export async function listProjectsWithSources() {
  const [allProjects, links] = await Promise.all([
    db.select().from(projects),
    db.select().from(sourceRelationships).where(eq(sourceRelationships.entityType, "project")),
  ]);
  return allProjects.map((project) => ({
    ...project,
    sources: links
      .filter((link) => link.entityId === project.id)
      .map((link) => ({ sourceId: link.sourceId, evidence: link.evidence })),
  }));
}
