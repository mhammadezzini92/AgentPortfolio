import type { Provenance, SourceType } from "@/models/schemas";

export type RetrievedChunk = {
  chunkId: number;
  content: string;
  heading: string | null;
  headingPath: string[];
  provenance: Provenance;
  // Higher is better: -bm25 scaled by the provenance weight.
  score: number;
  source: { id: number; type: SourceType; title: string | null; url: string | null };
  project: { id: number; name: string } | null;
};

export type SearchCandidate = Omit<RetrievedChunk, "score"> & {
  // FTS5 bm25: lower (more negative) is a better match.
  bm25: number;
  contentHash: string;
};

export type RankingOptions = {
  topK: number;
  maxContextChars: number;
  maxChunksPerSource?: number;
};

// A mild nudge only: questions about the owner should surface their own material first,
// but general chunks must still come through for "what is CQRS?". The answer prompt
// enforces the provenance rule; ranking doesn't.
const PROVENANCE_WEIGHT: Record<Provenance, number> = {
  personal: 1,
  unverified: 0.85,
  general: 0.7,
};

const DEFAULT_MAX_CHUNKS_PER_SOURCE = 3;

export function rankCandidates(candidates: SearchCandidate[], options: RankingOptions): RetrievedChunk[] {
  const maxPerSource = options.maxChunksPerSource ?? DEFAULT_MAX_CHUNKS_PER_SOURCE;
  const scored = candidates
    .map((candidate) => ({ candidate, score: -candidate.bm25 * PROVENANCE_WEIGHT[candidate.provenance] }))
    .sort((a, b) => b.score - a.score || a.candidate.chunkId - b.candidate.chunkId);

  const seenHashes = new Set<string>();
  const perSource = new Map<number, number>();
  const ranked: RetrievedChunk[] = [];
  let usedChars = 0;

  for (const { candidate, score } of scored) {
    if (ranked.length >= options.topK) break;
    if (seenHashes.has(candidate.contentHash)) continue;

    const sourceCount = perSource.get(candidate.source.id) ?? 0;
    if (sourceCount >= maxPerSource) continue;

    // The best chunk always goes in, so an oversized chunk can't produce an empty context.
    const fits = usedChars + candidate.content.length <= options.maxContextChars;
    if (!fits && ranked.length > 0) continue;

    seenHashes.add(candidate.contentHash);
    perSource.set(candidate.source.id, sourceCount + 1);
    usedChars += candidate.content.length;
    ranked.push({
      chunkId: candidate.chunkId,
      content: candidate.content,
      heading: candidate.heading,
      headingPath: candidate.headingPath,
      provenance: candidate.provenance,
      score,
      source: candidate.source,
      project: candidate.project,
    });
  }
  return ranked;
}
