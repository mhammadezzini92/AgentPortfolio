import { describe, expect, it } from "vitest";
import { chunkDocument } from "@/services/ingestion/chunker";

describe("chunkDocument", () => {
  it("splits on headings and tracks the heading path", () => {
    const text = "# Projects\n\n## Ledger\n\nBuilt a ledger.\n\n## Search\n\nBuilt search.\n\n# Skills\n\nGo, SQL";
    const chunks = chunkDocument(text);

    expect(chunks.map((c) => [c.heading, c.headingPath, c.content])).toEqual([
      ["Ledger", ["Projects", "Ledger"], "Built a ledger."],
      ["Search", ["Projects", "Search"], "Built search."],
      ["Skills", ["Skills"], "Go, SQL"],
    ]);
    expect(chunks.map((c) => c.index)).toEqual([0, 1, 2]);
  });

  it("keeps text before the first heading as an untitled chunk", () => {
    const chunks = chunkDocument("Intro line.\n\n# Section\n\nBody.");
    expect(chunks[0]).toMatchObject({ heading: null, headingPath: [], content: "Intro line." });
  });

  it("does not treat '#' inside fenced code as a heading", () => {
    const text = "# Setup\n\n```bash\n# install deps\nnpm i\n```";
    const chunks = chunkDocument(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("# install deps");
  });

  it("packs paragraphs up to the limit and never exceeds it", () => {
    const paragraph = "word ".repeat(60).trim();
    const text = `# Long\n\n${Array.from({ length: 10 }, () => paragraph).join("\n\n")}`;
    const chunks = chunkDocument(text, 700);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.content.length).toBeLessThanOrEqual(700);
    expect(chunks.every((c) => c.heading === "Long")).toBe(true);
  });

  it("splits an oversized paragraph on word boundaries", () => {
    const chunks = chunkDocument("alpha beta gamma delta ".repeat(100), 200);
    const words = chunks.flatMap((c) => c.content.split(/\s+/));

    for (const chunk of chunks) expect(chunk.content.length).toBeLessThanOrEqual(200);
    expect(words).toHaveLength(400);
    expect(new Set(words)).toEqual(new Set(["alpha", "beta", "gamma", "delta"]));
  });

  it("skips headings with no body", () => {
    const chunks = chunkDocument("# Empty\n\n# Full\n\nContent");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].heading).toBe("Full");
  });
});
