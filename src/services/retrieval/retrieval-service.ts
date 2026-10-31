import "server-only";
import { buildMatchExpression } from "@/services/retrieval/query-builder";
import { type RankingOptions, type RetrievedChunk, rankCandidates } from "@/services/retrieval/ranking";
import { findChunkCandidates } from "@/services/retrieval/search-repository";

// Over-fetch so dedupe and the per-source cap still leave topK chunks to choose from.
const CANDIDATE_MULTIPLIER = 3;

// No usable terms or no matches returns [], never an error: the answer step turns an
// empty context into "I don't have information on that".
export async function searchKnowledge(question: string, options: RankingOptions): Promise<RetrievedChunk[]> {
  const matchExpression = buildMatchExpression(question);
  if (!matchExpression) return [];

  try {
    const candidates = await findChunkCandidates(matchExpression, options.topK * CANDIDATE_MULTIPLIER);
    return rankCandidates(candidates, options);
  } catch (error) {
    throw new Error(`Knowledge search failed for ${matchExpression}`, { cause: error });
  }
}
