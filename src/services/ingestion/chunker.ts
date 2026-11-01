export const MAX_CHUNK_CHARS = 1500;

export type DocumentChunk = {
  index: number;
  heading: string | null;
  headingPath: string[];
  content: string;
};

type Section = { headingPath: string[]; lines: string[] };

const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE_PATTERN = /^\s*(```|~~~)/;

// Expects the heading-structured text produced by content-extractor ("# Heading" lines,
// fenced code). Text without headings becomes a single untitled section.
function splitIntoSections(text: string): Section[] {
  const sections: Section[] = [];
  const headingStack: { level: number; title: string }[] = [];
  let current: Section = { headingPath: [], lines: [] };
  let inFence = false;

  for (const line of text.split("\n")) {
    if (FENCE_PATTERN.test(line)) inFence = !inFence;
    const heading = inFence ? null : HEADING_PATTERN.exec(line);
    if (!heading) {
      current.lines.push(line);
      continue;
    }

    sections.push(current);
    const level = heading[1].length;
    while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
      headingStack.pop();
    }
    headingStack.push({ level, title: heading[2] });
    current = { headingPath: headingStack.map((entry) => entry.title), lines: [] };
  }
  sections.push(current);

  return sections.filter((section) => section.lines.some((line) => line.trim() !== ""));
}

// Blank lines separate paragraphs, except inside fenced code, which stays one block.
function splitIntoParagraphs(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let buffer: string[] = [];
  let inFence = false;

  const flush = () => {
    const paragraph = buffer.join("\n").trim();
    if (paragraph) paragraphs.push(paragraph);
    buffer = [];
  };

  for (const line of lines) {
    if (FENCE_PATTERN.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === "") {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return paragraphs;
}

function lastMatchIndex(text: string, pattern: RegExp): number {
  let last = -1;
  for (const match of text.matchAll(pattern)) last = match.index;
  return last;
}

// Cut points in order of preference. PDF text wraps lines mid-sentence, so a bare line
// break isn't a logical boundary; a bullet start or a sentence ending a line is.
const CUT_PATTERNS = [/\n(?=\s*(?:[•▪◦‣*–-]|\d+[.)])\s)/g, /(?<=[.!?:])\n/g, /\n/g, /\s/g];

// Last resort for a single paragraph longer than the limit; words are never split.
function splitOversized(paragraph: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let rest = paragraph;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    const cut = CUT_PATTERNS.map((pattern) => lastMatchIndex(window, pattern)).find((index) => index > maxChars / 2);
    const end = cut ?? maxChars;
    pieces.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

function packParagraphs(paragraphs: string[], maxChars: number): string[] {
  const packed: string[] = [];
  let current = "";

  for (const paragraph of paragraphs.flatMap((p) => splitOversized(p, maxChars))) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) packed.push(current);
    current = paragraph;
  }
  if (current) packed.push(current);
  return packed;
}

export function chunkDocument(text: string, maxChars = MAX_CHUNK_CHARS): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];

  for (const section of splitIntoSections(text)) {
    for (const content of packParagraphs(splitIntoParagraphs(section.lines), maxChars)) {
      chunks.push({
        index: chunks.length,
        heading: section.headingPath.at(-1) ?? null,
        headingPath: section.headingPath,
        content,
      });
    }
  }
  return chunks;
}
