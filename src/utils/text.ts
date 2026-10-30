import { createHash } from "node:crypto";

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// Used for entity matching and evidence lookup: case, punctuation spacing and line breaks
// differ between sources and between the source text and what the model quotes back.
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
