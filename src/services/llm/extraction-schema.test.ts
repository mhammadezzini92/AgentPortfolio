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
    const { extraction: result } = sanitizeExtraction(
      extraction({ projects: [project("Ledger", "built ledger,  a double-entry\naccounting service")] }),
      [SOURCE_TEXT],
      "cv",
      2,
    );
    expect(result.projects).toHaveLength(1);
  });

  it("drops entities whose evidence is not in the source (hallucinated or injected)", () => {
    const { extraction: result, dropped } = sanitizeExtraction(
      extraction({ projects: [project("Mars Rover", "Led the NASA Mars rover software team")] }),
      [SOURCE_TEXT],
      "cv",
      2,
    );
    expect(result.projects).toEqual([]);
    expect(dropped).toEqual(["project Mars Rover"]);
  });

  it("matches quotes the model de-hyphenated from PDF line breaks", () => {
    const pdfText = "• Lead Odoo ERP implementations through deployment and post-\nproduction support, with careful imple-\nmentation.";
    const quoted = (evidence: string) =>
      sanitizeExtraction(extraction({ projects: [project("Unlisted", evidence)] }), [pdfText], "cv", 2).extraction.projects;

    expect(quoted("through deployment and post-production support")).toHaveLength(1);
    expect(quoted("with careful implementation")).toHaveLength(1);
    expect(quoted("through deployment and pre-production support")).toHaveLength(0);
  });

  it("returns no entities for general-knowledge source types", () => {
    const { extraction: result } = sanitizeExtraction(
      extraction({
        projects: [project("Ledger", "Built Ledger")],
        chunkLabels: [{ chunkIndex: 0, provenance: "general", projectName: "Ledger" }],
      }),
      [SOURCE_TEXT],
      "article",
      2,
    );
    expect(result.projects).toEqual([]);
    expect(result.chunkLabels).toEqual([{ chunkIndex: 0, provenance: "general", projectName: null }]);
  });

  it("drops out-of-range chunk labels and unknown project references", () => {
    const { extraction: result } = sanitizeExtraction(
      extraction({
        projects: [project("Ledger", "Built Ledger")],
        chunkLabels: [
          { chunkIndex: 0, provenance: "personal", projectName: "ledger" },
          { chunkIndex: 1, provenance: "unverified", projectName: "Ghost" },
          { chunkIndex: 7, provenance: "general", projectName: null },
        ],
      }),
      [SOURCE_TEXT],
      "cv",
      2,
    );
    expect(result.chunkLabels).toEqual([
      { chunkIndex: 0, provenance: "personal", projectName: "ledger" },
      { chunkIndex: 1, provenance: "unverified", projectName: null },
    ]);
  });

  it("nulls malformed dates instead of storing them", () => {
    const { extraction: result } = sanitizeExtraction(
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
      [SOURCE_TEXT],
      "cv",
      2,
    );
    expect(result.experiences[0].startDate).toBeNull();
  });
});

describe("CV chunk labels", () => {
  it("relabels general chunks in a CV as personal, but not in other source types", () => {
    const labels = [{ chunkIndex: 1, provenance: "general" as const, projectName: null }];
    expect(sanitizeExtraction(extraction({ chunkLabels: labels }), [SOURCE_TEXT], "cv", 2).extraction.chunkLabels[0].provenance).toBe("personal");
    expect(sanitizeExtraction(extraction({ chunkLabels: labels }), [SOURCE_TEXT], "portfolio", 2).extraction.chunkLabels[0].provenance).toBe("general");
  });
});

describe("evidence quotes the way models write them", () => {
  const source = "Name: Nifty Craft\nRole: Backend Technical Lead\nImportance: Flagship case study\nOwned:\n- Backend architecture and hands-on delivery.";
  const kept = (evidence: string) =>
    sanitizeExtraction(extraction({ projects: [project("Unlisted", evidence)] }), [source], "portfolio", 2).extraction.projects.length;

  it("ignores the prompt's chunk marker and skipped lines inside a multi-line quote", () => {
    expect(kept("[chunk 14 (Portfolio content > Case studies > Nifty Craft)] Name: Nifty Craft")).toBe(1);
    expect(kept("Name: Nifty Craft\nRole: Backend Technical Lead\nOwned:\n- Backend architecture and hands-on delivery.")).toBe(1);
  });

  it("still rejects a quote with any substantial line that isn't in the source", () => {
    expect(kept("Name: Nifty Craft\nRole: Chief Executive Officer")).toBe(0);
    expect(kept("[chunk 3] Ok")).toBe(0);
  });
});

describe("evidence windows", () => {
  const sections = ["Role: Backend Technical Lead at Nifty Craft", "Period: Feb 2022 - Aug 2025", "Skills: Go and Kafka", "Company: Vira Systems since 2026"];
  const kept = (evidence: string) =>
    sanitizeExtraction(extraction({ projects: [project("X", evidence)] }), sections, "portfolio", 4).extraction.projects.length;

  it("accepts a quote whose lines come from one chunk or two adjacent ones", () => {
    expect(kept("Role: Backend Technical Lead at Nifty Craft\nPeriod: Feb 2022 - Aug 2025")).toBe(1);
  });

  it("rejects a quote stitched from distant chunks", () => {
    expect(kept("Role: Backend Technical Lead at Nifty Craft\nCompany: Vira Systems since 2026")).toBe(0);
  });
});

describe("anchoring by identifying fields", () => {
  const sections = ["Role: Backend Technical Lead\nCompany: Nifty Craft\nPeriod: Feb 2022 - Aug 2025", "Name: Muluk\nDescription: Multiplayer strategy game backend."];

  it("keeps entities with a mangled quote when their name, or company and position, appear verbatim", () => {
    const result = sanitizeExtraction(
      extraction({
        projects: [project("Muluk", "Muluk — a strategy game (paraphrased)")],
        experiences: [{ company: "Nifty Craft", position: "Backend Technical Lead", description: null, responsibilities: [], technologies: [], startDate: "2022-02", endDate: "2025-08", evidence: "paraphrased role" }],
      }),
      sections,
      "portfolio",
      2,
    ).extraction;
    expect(result.projects).toHaveLength(1);
    expect(result.experiences).toHaveLength(1);
  });

  it("still drops invented entities whose names aren't in the document", () => {
    const { extraction: result, dropped } = sanitizeExtraction(
      extraction({
        projects: [project("Mars Rover", "paraphrased")],
        experiences: [{ company: "NASA", position: "Backend Technical Lead", description: null, responsibilities: [], technologies: [], startDate: null, endDate: null, evidence: "paraphrased" }],
      }),
      sections,
      "portfolio",
      2,
    );
    expect(result.projects).toEqual([]);
    expect(result.experiences).toEqual([]);
    expect(dropped).toEqual(["experience Backend Technical Lead at NASA", "project Mars Rover"]);
  });
});
