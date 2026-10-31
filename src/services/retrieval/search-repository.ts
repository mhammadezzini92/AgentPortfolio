import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { Provenance, SourceType } from "@/models/schemas";
import type { SearchCandidate } from "@/services/retrieval/ranking";

type CandidateRow = {
  id: number;
  content: string;
  heading: string | null;
  metadata: string;
  provenance: Provenance;
  content_hash: string;
  bm25: number;
  source_id: number;
  source_type: SourceType;
  source_title: string | null;
  source_url: string | null;
  project_id: number | null;
  project_name: string | null;
};

// Column weights follow the fts5 column order (content, heading): a heading hit counts double.
const CONTENT_WEIGHT = 1.0;
const HEADING_WEIGHT = 2.0;

function parseHeadingPath(metadata: string): string[] {
  try {
    const parsed: unknown = JSON.parse(metadata);
    const headingPath = (parsed as { headingPath?: unknown })?.headingPath;
    return Array.isArray(headingPath) ? headingPath.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function toCandidate(row: CandidateRow): SearchCandidate {
  return {
    chunkId: row.id,
    content: row.content,
    heading: row.heading,
    headingPath: parseHeadingPath(row.metadata),
    provenance: row.provenance,
    bm25: row.bm25,
    contentHash: row.content_hash,
    source: { id: row.source_id, type: row.source_type, title: row.source_title, url: row.source_url },
    project: row.project_id !== null && row.project_name !== null ? { id: row.project_id, name: row.project_name } : null,
  };
}

// matchExpression must come from buildMatchExpression; raw user text is not valid MATCH syntax.
export async function findChunkCandidates(matchExpression: string, limit: number): Promise<SearchCandidate[]> {
  const rows = await db.all<CandidateRow>(sql`
    select c.id, c.content, c.heading, c.metadata, c.provenance, c.content_hash,
           bm25(knowledge_chunks_fts, ${CONTENT_WEIGHT}, ${HEADING_WEIGHT}) as bm25,
           s.id as source_id, s.source_type, s.title as source_title, s.source_url,
           p.id as project_id, p.name as project_name
    from knowledge_chunks_fts
    join knowledge_chunks c on c.id = knowledge_chunks_fts.rowid
    join knowledge_sources s on s.id = c.source_id
    left join projects p on p.id = c.project_id
    where knowledge_chunks_fts match ${matchExpression}
    order by bm25
    limit ${limit}
  `);
  return rows.map(toCandidate);
}
