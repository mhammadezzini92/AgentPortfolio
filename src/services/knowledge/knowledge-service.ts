import "server-only";
import { db, type Transaction } from "@/lib/db";
import { deleteSourceFile } from "@/lib/blob";
import { logger } from "@/lib/logger";
import type { EntityType, KnowledgeSource, NewExperience, NewKnowledgeChunk, NewProject, SourceType } from "@/models/schemas";
import type { DocumentChunk } from "@/services/ingestion/chunker";
import type { KnowledgeExtraction } from "@/services/llm/extraction-schema";
import { replaceSourceChunks } from "@/services/knowledge/chunk-repository";
import {
  experienceKey,
  findSameEngagement,
  mergeExperience,
  mergeProfile,
  mergeProject,
  projectKey,
} from "@/services/knowledge/entity-merge";
import {
  deleteUnsupportedEntities,
  getProfile,
  listExperiences,
  listProjects,
  listRelationshipsForSource,
  replaceSourceRelationships,
  saveExperience,
  saveProject,
  upsertProfile,
} from "@/services/knowledge/entity-repository";
import { completeJob } from "@/services/knowledge/job-repository";
import { DEFAULT_PROVENANCE, sourceTypeOverwritesFacts } from "@/services/knowledge/provenance";
import { deleteIdleSource, findSourceById, setSourceStatus } from "@/services/knowledge/source-repository";
import { sha256Hex } from "@/utils/text";

type EntityLink = { entityType: EntityType; entityId: number; evidence: string };

async function mergeEntities(tx: Transaction, extraction: KnowledgeExtraction, sourceType: SourceType) {
  const links: EntityLink[] = [];
  const projectIdsByKey = new Map<string, number>();
  const options = { fillOnly: !sourceTypeOverwritesFacts(sourceType) };

  if (extraction.profile) {
    const merged = mergeProfile(await getProfile(tx), extraction.profile, options);
    if (merged) {
      await upsertProfile(tx, merged);
      links.push({ entityType: "profile", entityId: 1, evidence: extraction.profile.evidence });
    }
  }

  const storedProjects = new Map<string, NewProject>((await listProjects(tx)).map((p) => [projectKey(p.name), p]));
  for (const incoming of extraction.projects) {
    const key = projectKey(incoming.name);
    const existing = storedProjects.get(key);
    const merged = mergeProject(existing, incoming, options);
    const id = await saveProject(tx, existing?.id, merged);
    // The model can list the same project twice; later mentions merge into the first.
    storedProjects.set(key, { ...merged, id });
    projectIdsByKey.set(key, id);
    links.push({ entityType: "project", entityId: id, evidence: incoming.evidence });
  }

  const storedExperiences = new Map<string, NewExperience>(
    (await listExperiences(tx)).map((e) => [experienceKey(e.company, e.position), e]),
  );
  for (const incoming of extraction.experiences) {
    const key = experienceKey(incoming.company, incoming.position);
    const existing = storedExperiences.get(key) ?? findSameEngagement(storedExperiences.values(), incoming);
    const merged = mergeExperience(existing, incoming, options);
    const id = await saveExperience(tx, existing?.id, merged);
    // Registered under both titles, so later mentions of either merge into this row.
    storedExperiences.set(key, { ...merged, id });
    storedExperiences.set(experienceKey(merged.company, merged.position), { ...merged, id });
    links.push({ entityType: "experience", entityId: id, evidence: incoming.evidence });
  }

  return { links, projectIdsByKey };
}

function buildChunkRows(
  source: KnowledgeSource,
  chunks: DocumentChunk[],
  extraction: KnowledgeExtraction,
  projectIdsByKey: Map<string, number>,
): NewKnowledgeChunk[] {
  const labels = new Map(extraction.chunkLabels.map((label) => [label.chunkIndex, label]));
  return chunks.map((chunk) => {
    const label = labels.get(chunk.index);
    return {
      sourceId: source.id,
      projectId: label?.projectName ? (projectIdsByKey.get(projectKey(label.projectName)) ?? null) : null,
      content: chunk.content,
      heading: chunk.heading,
      chunkIndex: chunk.index,
      provenance: label?.provenance ?? DEFAULT_PROVENANCE[source.sourceType],
      contentHash: sha256Hex(chunk.content),
      metadata: { headingPath: chunk.headingPath },
    };
  });
}

type PersistInput = {
  source: KnowledgeSource;
  jobId: number;
  contentHash: string;
  title: string | null;
  chunks: DocumentChunk[];
  extraction: KnowledgeExtraction;
};

// One transaction: a failed run leaves the previous chunks, entities and links intact.
// content_hash is written only here, so "hash unchanged" always means "last run succeeded".
export async function persistIngestion(input: PersistInput): Promise<void> {
  await db.transaction(async (tx) => {
    const previousLinks = await listRelationshipsForSource(tx, input.source.id);
    const { links, projectIdsByKey } = await mergeEntities(tx, input.extraction, input.source.sourceType);

    await replaceSourceRelationships(tx, input.source.id, links);
    await replaceSourceChunks(tx, input.source.id, buildChunkRows(input.source, input.chunks, input.extraction, projectIdsByKey));
    await deleteUnsupportedEntities(tx, previousLinks);

    await setSourceStatus(tx, input.source.id, "completed", {
      contentHash: input.contentHash,
      title: input.title ?? input.source.title,
      lastFetchedAt: new Date(),
    });
    await completeJob(tx, input.jobId);
  });
}

// Chunks, links and jobs cascade with the source row; entities go only if no other
// source still supports them. The blob is removed after the commit so a failed
// delete never leaves a source pointing at a missing file.
export async function deleteSource(id: number, staleBefore: Date): Promise<"deleted" | "not_found" | "busy"> {
  const deleted = await db.transaction(async (tx) => {
    const links = await listRelationshipsForSource(tx, id);
    const source = await deleteIdleSource(tx, id, staleBefore);
    if (source) await deleteUnsupportedEntities(tx, links);
    return source;
  });
  if (!deleted) return (await findSourceById(id)) ? "busy" : "not_found";

  if (deleted.storagePath) {
    // The source is already gone; a leftover blob is private and unreferenced, so
    // logging it for manual cleanup is the right outcome rather than failing the request.
    await deleteSourceFile(deleted.storagePath).catch((error: unknown) =>
      logger.warn("Orphaned blob after source delete", { sourceId: id, storagePath: deleted.storagePath, error }),
    );
  }
  return "deleted";
}
