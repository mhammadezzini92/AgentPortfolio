import type { Provenance, SourceType } from "@/models/schemas";

// Starting point for every chunk; the extractor only overrides exceptions,
// so a missed label falls back to the conservative default for the source.
export const DEFAULT_PROVENANCE: Record<SourceType, Provenance> = {
  cv: "personal",
  portfolio: "personal",
  github: "personal",
  upload: "unverified",
  article: "general",
  documentation: "general",
};

// The owner's own CV, portfolio and GitHub define their profile. Other uploads (cover
// letters, notes) may fill gaps but must never overwrite what those sources say.
export function sourceTypeOverwritesFacts(sourceType: SourceType): boolean {
  return sourceType === "cv" || sourceType === "portfolio" || sourceType === "github";
}

// Articles and docs describe technology in general; entities extracted from them would
// put general practices into the owner's profile, which the provenance rule forbids.
export function sourceTypeYieldsEntities(sourceType: SourceType): boolean {
  return sourceType !== "article" && sourceType !== "documentation";
}
