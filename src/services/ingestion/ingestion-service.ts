import "server-only";
import { db, isUniqueViolation } from "@/lib/db";
import { readSourceFile, storeSourceFile } from "@/lib/blob";
import { logger } from "@/lib/logger";
import type { IngestionJob, KnowledgeSource, SourceType } from "@/models/schemas";
import { chunkDocument } from "@/services/ingestion/chunker";
import type { ExtractedContent } from "@/services/ingestion/content-extractor";
import { parseDocument } from "@/services/ingestion/document-parser";
import { fetchPublicDocument } from "@/services/ingestion/url-fetcher";
import { persistIngestion } from "@/services/knowledge/knowledge-service";
import { completeJob, failJob, insertProcessingJob } from "@/services/knowledge/job-repository";
import {
  claimSourceForProcessing,
  deleteSourceRow,
  findOtherSourceIdByContentHash,
  findSourceById,
  insertSource,
  setSourceStatus,
  setSourceStoragePath,
} from "@/services/knowledge/source-repository";
import { extractKnowledge } from "@/services/llm/extraction";
import { sha256Hex } from "@/utils/text";
import { detectDocumentMime } from "@/utils/validation";

// Route handlers that schedule a run export maxDuration = INGESTION_MAX_DURATION_SECONDS.
// A run still "processing" after twice that was killed with its function instance.
export const INGESTION_MAX_DURATION_SECONDS = 120;
const STALE_AFTER_MS = INGESTION_MAX_DURATION_SECONDS * 2 * 1000;

export const staleProcessingCutoff = () => new Date(Date.now() - STALE_AFTER_MS);

export class DuplicateSourceError extends Error {
  constructor(readonly existingSourceId: number | null, message: string) {
    super(message);
  }
}

export type ClaimResult =
  | { status: "claimed"; source: KnowledgeSource; job: IngestionJob }
  | { status: "not_found" }
  | { status: "busy" };

export async function claimSourceForIngestion(sourceId: number): Promise<ClaimResult> {
  const source = await claimSourceForProcessing(sourceId, staleProcessingCutoff());
  if (!source) return (await findSourceById(sourceId)) ? { status: "busy" } : { status: "not_found" };
  return { status: "claimed", source, job: await insertProcessingJob(source.id) };
}

type UploadInput = { file: File; bytes: Buffer; sourceType: SourceType; title: string | null };

// The file must be in Blob before the request returns, since the background run reads it from there.
export async function createUploadSource(input: UploadInput): Promise<KnowledgeSource> {
  const source = await insertSource({ sourceType: input.sourceType, title: input.title ?? input.file.name });
  try {
    const storagePath = await storeSourceFile({
      sourceId: source.id,
      fileName: input.file.name,
      body: input.bytes,
      contentType: input.file.type,
    });
    await setSourceStoragePath(source.id, storagePath);
    return { ...source, storagePath };
  } catch (error) {
    await deleteSourceRow(source.id);
    throw error;
  }
}

// URL.toString() canonicalizes host case and the empty path; the fragment never reaches
// the server, so dropping it keeps the unique index on source_url meaningful.
export async function createUrlSource(url: URL, sourceType: SourceType, title: string | null): Promise<KnowledgeSource> {
  const canonical = new URL(url);
  canonical.hash = "";
  try {
    return await insertSource({ sourceType, sourceUrl: canonical.toString(), title });
  } catch (error) {
    if (isUniqueViolation(error, "knowledge_sources.source_url")) {
      throw new DuplicateSourceError(null, `A source for ${canonical} already exists; reprocess it instead`);
    }
    throw error;
  }
}

async function loadContent(source: KnowledgeSource): Promise<ExtractedContent> {
  if (source.storagePath) {
    const bytes = await readSourceFile(source.storagePath);
    const mime = detectDocumentMime(bytes);
    if (!mime) throw new Error("Stored file is neither PDF nor DOCX");
    return parseDocument(bytes, mime);
  }
  if (source.sourceUrl) {
    const fetched = await fetchPublicDocument(source.sourceUrl);
    return parseDocument(fetched.body, fetched.contentType);
  }
  throw new Error("Source has neither a stored file nor a URL");
}

type RunOptions = { force: boolean };

async function runPipeline(source: KnowledgeSource, job: IngestionJob, options: RunOptions): Promise<void> {
  const content = await loadContent(source);
  if (content.text.length < 50) throw new Error("No extractable text (scanned PDF or empty page?)");

  const contentHash = sha256Hex(content.text);
  if (!options.force && contentHash === source.contentHash) {
    await db.transaction(async (tx) => {
      await setSourceStatus(tx, source.id, "completed", { lastFetchedAt: new Date() });
      await completeJob(tx, job.id);
    });
    logger.info("Source unchanged, skipped extraction", { sourceId: source.id, jobId: job.id });
    return;
  }

  const duplicateOf = await findOtherSourceIdByContentHash(contentHash, source.id);
  if (duplicateOf !== undefined) throw new DuplicateSourceError(duplicateOf, `Duplicate of source #${duplicateOf}`);

  const chunks = chunkDocument(content.text);
  const title = source.title ?? content.title;
  const extraction = await extractKnowledge({ sourceId: source.id, sourceType: source.sourceType, title, chunks });

  try {
    await persistIngestion({ source, jobId: job.id, contentHash, title, chunks, extraction });
  } catch (error) {
    // Another source committed the same content between our check and this write.
    if (isUniqueViolation(error, "knowledge_sources.content_hash")) {
      throw new DuplicateSourceError(null, "Duplicate of another source (committed concurrently)");
    }
    throw error;
  }
  logger.info("Ingestion completed", { sourceId: source.id, jobId: job.id, chunkCount: chunks.length });
}

// Never throws: it runs inside after(), where an exception has nowhere to go.
// Every failure ends up on the job row, which is what the admin dashboard shows.
export async function runIngestionJob(source: KnowledgeSource, job: IngestionJob, options: RunOptions): Promise<void> {
  try {
    await runPipeline(source, job, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Ingestion failed", { sourceId: source.id, jobId: job.id, error });
    try {
      await db.transaction(async (tx) => {
        await failJob(tx, job.id, message);
        await setSourceStatus(tx, source.id, "failed");
      });
    } catch (recordError) {
      logger.error("Could not record ingestion failure", { sourceId: source.id, jobId: job.id, error: recordError });
    }
  }
}
