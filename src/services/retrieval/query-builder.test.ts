import { describe, expect, it } from "vitest";
import { buildMatchExpression, extractSearchTerms } from "@/services/retrieval/query-builder";

describe("extractSearchTerms", () => {
  it("drops stopwords, single letters and duplicates", () => {
    expect(extractSearchTerms("What did he build with Kafka and kafka, a Go service?")).toEqual(["build", "kafka", "go", "service"]);
  });

  it("keeps non-English words and numbers", () => {
    expect(extractSearchTerms("Café système 2024")).toEqual(["café", "système", "2024"]);
  });

  it("caps the number of terms", () => {
    const question = Array.from({ length: 30 }, (_, i) => `term${i}`).join(" ");
    expect(extractSearchTerms(question)).toHaveLength(12);
  });
});

describe("buildMatchExpression", () => {
  it("quotes every term, adds prefix matching for longer ones and joins with OR", () => {
    expect(buildMatchExpression("Experience with Postgres and Go?")).toBe('"experience"* OR "postgres"* OR "go"');
  });

  it("strips FTS5 operators, column filters and quotes", () => {
    const expression = buildMatchExpression('kafka" OR content:secret NEAR(a b) -drop * ^start');
    expect(expression).toBe('"kafka"* OR "content"* OR "secret"* OR "near"* OR "drop"* OR "start"*');
    expect(expression).not.toMatch(/[():^-]/);
  });

  it("returns null when nothing searchable is left", () => {
    expect(buildMatchExpression("Tell me about yourself?")).toBeNull();
    expect(buildMatchExpression("who is he?")).toBeNull();
    expect(buildMatchExpression("?!  --- ''")).toBeNull();
  });
});
