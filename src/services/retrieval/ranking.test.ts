import { describe, expect, it } from "vitest";
import type { Provenance } from "@/models/schemas";
import { type SearchCandidate, rankCandidates } from "@/services/retrieval/ranking";

let nextId = 1;

function candidate(overrides: { bm25: number; provenance?: Provenance; sourceId?: number; content?: string; contentHash?: string }): SearchCandidate {
  const chunkId = nextId++;
  return {
    chunkId,
    content: overrides.content ?? `chunk ${chunkId}`,
    heading: null,
    headingPath: [],
    provenance: overrides.provenance ?? "personal",
    bm25: overrides.bm25,
    contentHash: overrides.contentHash ?? `hash-${chunkId}`,
    source: { id: overrides.sourceId ?? chunkId, type: "cv", title: null, url: null },
    project: null,
  };
}

const roomy = { topK: 10, maxContextChars: 100_000 };

describe("rankCandidates", () => {
  it("orders by -bm25 scaled by provenance weight", () => {
    const general = candidate({ bm25: -10, provenance: "general" });
    const personal = candidate({ bm25: -8, provenance: "personal" });
    const unverified = candidate({ bm25: -9, provenance: "unverified" });

    const ranked = rankCandidates([general, unverified, personal], roomy);

    expect(ranked.map((chunk) => chunk.chunkId)).toEqual([personal.chunkId, unverified.chunkId, general.chunkId]);
    expect(ranked[0].score).toBeCloseTo(8);
    expect(ranked[2].score).toBeCloseTo(7);
  });

  it("still lets a much stronger general match beat a weak personal one", () => {
    const general = candidate({ bm25: -20, provenance: "general" });
    const personal = candidate({ bm25: -5, provenance: "personal" });
    expect(rankCandidates([personal, general], roomy)[0].chunkId).toBe(general.chunkId);
  });

  it("drops chunks with identical content from other sources", () => {
    const original = candidate({ bm25: -5, contentHash: "same" });
    const copy = candidate({ bm25: -4, contentHash: "same" });
    expect(rankCandidates([original, copy], roomy).map((chunk) => chunk.chunkId)).toEqual([original.chunkId]);
  });

  it("caps chunks per source so one long document can't crowd out the rest", () => {
    const article = [1, 2, 3, 4].map((i) => candidate({ bm25: -10 - i, sourceId: 99 }));
    const cv = candidate({ bm25: -1, sourceId: 7 });

    const ranked = rankCandidates([...article, cv], roomy);

    expect(ranked.filter((chunk) => chunk.source.id === 99)).toHaveLength(3);
    expect(ranked.at(-1)?.chunkId).toBe(cv.chunkId);
  });

  it("stops at topK", () => {
    const candidates = [1, 2, 3, 4, 5].map((i) => candidate({ bm25: -i }));
    expect(rankCandidates(candidates, { topK: 2, maxContextChars: 100_000 })).toHaveLength(2);
  });

  it("skips chunks that overflow the character budget but keeps smaller ones that fit", () => {
    const best = candidate({ bm25: -9, content: "a".repeat(60) });
    const tooBig = candidate({ bm25: -8, content: "b".repeat(60) });
    const small = candidate({ bm25: -7, content: "c".repeat(30) });

    const ranked = rankCandidates([best, tooBig, small], { topK: 10, maxContextChars: 100 });

    expect(ranked.map((chunk) => chunk.chunkId)).toEqual([best.chunkId, small.chunkId]);
  });

  it("always keeps the best chunk even if it alone exceeds the budget", () => {
    const huge = candidate({ bm25: -9, content: "x".repeat(500) });
    expect(rankCandidates([huge], { topK: 5, maxContextChars: 100 })).toHaveLength(1);
  });

  it("returns an empty list for no candidates", () => {
    expect(rankCandidates([], roomy)).toEqual([]);
  });
});
