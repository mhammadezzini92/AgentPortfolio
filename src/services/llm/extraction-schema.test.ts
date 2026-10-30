import { describe, expect, it } from "vitest";
import { type KnowledgeExtraction, sanitizeExtraction } from "@/services/llm/extraction-schema";

const SOURCE_TEXT = `[chunk 0 (Projects > Ledger)]
Built Ledger, a double-entry accounting service in Go handling 2M transactions per day.

[chunk 1 (Experience)]
Senior Engineer at Acme Corp, 2020-03 to present.`;

const project = (name: string, evidence: string) => ({
  name,
  description: null,
  role: null,
  architecture: null,
  technologies: [],
  challenges: null,
  solutions: null,
  achievements: null,
  evidence,
});

const extraction = (overrides: Partial<KnowledgeExtraction> = {}): KnowledgeExtraction => ({
  profile: null,
  experiences: [],
  projects: [],
  chunkLabels: [],
  ...overrides,
});

describe("sanitizeExtraction", () => {
  it("keeps entities whose evidence appears in the source, ignoring case and whitespace", () => {
    const result = sanitizeExtraction(
      extraction({ projects: [project("Ledger", "built ledger,  a double-entry\naccounting service")] }),
      SOURCE_TEXT,
      "cv",
      2,
    );
    expect(result.projects).toHaveLength(1);
  });

  it("drops entities whose evidence is not in the source (hallucinated or injected)", () => {
    const result = sanitizeExtraction(
      extraction({ projects: [project("Mars Rover", "Led the NASA Mars rover software team")] }),
      SOURCE_TEXT,
      "cv",
      2,
    );
    expect(result.projects).toEqual([]);
  });

  it("returns no entities for general-knowledge source types", () => {
    const result = sanitizeExtraction(
      extraction({
        projects: [project("Ledger", "Built Ledger")],
        chunkLabels: [{ chunkIndex: 0, provenance: "general", projectName: "Ledger" }],
      }),
      SOURCE_TEXT,
      "article",
      2,
    );
    expect(result.projects).toEqual([]);
    expect(result.chunkLabels).toEqual([{ chunkIndex: 0, provenance: "general", projectName: null }]);
  });

  it("drops out-of-range chunk labels and unknown project references", () => {
    const result = sanitizeExtraction(
      extraction({
        projects: [project("Ledger", "Built Ledger")],
        chunkLabels: [
          { chunkIndex: 0, provenance: "personal", projectName: "ledger" },
          { chunkIndex: 1, provenance: "unverified", projectName: "Ghost" },
          { chunkIndex: 7, provenance: "general", projectName: null },
        ],
      }),
      SOURCE_TEXT,
      "cv",
      2,
    );
    expect(result.chunkLabels).toEqual([
      { chunkIndex: 0, provenance: "personal", projectName: "ledger" },
      { chunkIndex: 1, provenance: "unverified", projectName: null },
    ]);
  });

  it("nulls malformed dates instead of storing them", () => {
    const result = sanitizeExtraction(
      extraction({
        experiences: [
          {
            company: "Acme Corp",
            position: "Senior Engineer",
            description: null,
            responsibilities: [],
            technologies: [],
            startDate: "March 2020",
            endDate: null,
            evidence: "Senior Engineer at Acme Corp",
          },
        ],
      }),
      SOURCE_TEXT,
      "cv",
      2,
    );
    expect(result.experiences[0].startDate).toBeNull();
  });
});
