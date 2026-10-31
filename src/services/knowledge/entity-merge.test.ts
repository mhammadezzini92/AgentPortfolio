import { describe, expect, it } from "vitest";
import {
  experienceKey,
  mergeExperience,
  mergeProfile,
  mergeProject,
  projectKey,
} from "@/services/knowledge/entity-merge";
import type { ExtractedProfile, ExtractedProject } from "@/services/llm/extraction-schema";

const extractedProject = (overrides: Partial<ExtractedProject> = {}): ExtractedProject => ({
  name: "Ledger",
  description: null,
  role: null,
  architecture: null,
  technologies: [],
  challenges: null,
  solutions: null,
  achievements: null,
  evidence: "Built Ledger",
  ...overrides,
});

const extractedProfile = (overrides: Partial<ExtractedProfile> = {}): ExtractedProfile => ({
  fullName: null,
  title: null,
  professionalSummary: null,
  location: null,
  skills: [],
  languages: [],
  education: [],
  contactInformation: { email: null, phone: null, website: null, linkedin: null, github: null },
  evidence: "Jane Doe",
  ...overrides,
});

describe("mergeProject", () => {
  it("lets newer non-null values win and keeps older values the source left null", () => {
    const merged = mergeProject(
      { name: "Ledger", description: "Old", role: "Lead", technologies: ["Go"] },
      extractedProject({ description: "New", role: null, technologies: ["go", "Kafka"] }),
    );
    expect(merged).toMatchObject({ name: "Ledger", description: "New", role: "Lead" });
    expect(merged.technologies).toEqual(["Go", "Kafka"]);
  });

  it("keeps the stored name casing when matching on a normalized key", () => {
    expect(projectKey("  The  LEDGER ")).toBe(projectKey("the ledger"));
    expect(mergeProject({ name: "The Ledger" }, extractedProject({ name: "the ledger" })).name).toBe("The Ledger");
  });
});

describe("mergeExperience", () => {
  it("matches on company and position regardless of case and spacing", () => {
    expect(experienceKey("Acme  Corp", "Senior Engineer")).toBe(experienceKey("acme corp", "senior engineer"));
  });

  it("unions responsibilities without duplicates", () => {
    const merged = mergeExperience(
      { company: "Acme", position: "Engineer", responsibilities: ["Owned billing"] },
      {
        company: "Acme",
        position: "Engineer",
        description: null,
        responsibilities: ["owned billing", "Ran on-call"],
        technologies: [],
        startDate: "2020-01",
        endDate: null,
        evidence: "Acme",
      },
    );
    expect(merged.responsibilities).toEqual(["Owned billing", "Ran on-call"]);
    expect(merged.startDate).toBe("2020-01");
  });
});

describe("mergeProfile", () => {
  it("returns null when neither the stored profile nor the source names the owner", () => {
    expect(mergeProfile(undefined, extractedProfile())).toBeNull();
  });

  it("merges contact fields without erasing ones the new source omits", () => {
    const merged = mergeProfile(
      { fullName: "Jane Doe", contactInformation: { email: "jane@example.com" } },
      extractedProfile({ contactInformation: { email: null, phone: null, website: null, linkedin: null, github: "https://github.com/jane" } }),
    );
    expect(merged?.contactInformation).toEqual({ email: "jane@example.com", github: "https://github.com/jane" });
  });

  it("unions languages by name and drops null fields", () => {
    const merged = mergeProfile(
      { fullName: "Jane", languages: [{ name: "English", proficiency: "Native" }] },
      extractedProfile({ languages: [{ name: "english", proficiency: null }, { name: "Arabic", proficiency: null }] }),
    );
    expect(merged?.languages).toEqual([{ name: "English", proficiency: "Native" }, { name: "Arabic" }]);
  });
});

describe("merging into hand-edited rows", () => {
  const editedAt = new Date("2026-10-01T00:00:00Z");

  it("keeps edited project values, fills only empty fields and doesn't union lists", () => {
    const merged = mergeProject(
      { name: "Ledger", description: "Mine", role: null, technologies: ["Go"], manuallyEditedAt: editedAt },
      extractedProject({ description: "Extracted", role: "Lead", technologies: ["Go", "Kafka"] }),
    );
    expect(merged).toMatchObject({ description: "Mine", role: "Lead", technologies: ["Go"] });
  });

  it("fills an edited row's empty list from the source", () => {
    const merged = mergeProject({ name: "Ledger", technologies: [], manuallyEditedAt: editedAt }, extractedProject({ technologies: ["Kafka"] }));
    expect(merged.technologies).toEqual(["Kafka"]);
  });

  it("keeps an edited experience's null end date instead of taking the source's", () => {
    const merged = mergeExperience(
      { company: "Acme", position: "Engineer", endDate: null, manuallyEditedAt: editedAt },
      { company: "Acme", position: "Engineer", description: null, responsibilities: [], technologies: [], startDate: "2020", endDate: "2023", evidence: "Acme" },
    );
    expect(merged).toMatchObject({ startDate: "2020", endDate: null });
  });

  it("keeps edited profile fields and contact values over extracted ones", () => {
    const merged = mergeProfile(
      { id: 1, fullName: "Jane D.", title: null, skills: ["Go"], contactInformation: { email: "me@jane.dev" }, manuallyEditedAt: editedAt },
      extractedProfile({
        fullName: "Jane Doe",
        title: "Engineer",
        skills: ["Rust"],
        contactInformation: { email: "old@jane.dev", phone: "123", website: null, linkedin: null, github: null },
      }),
    );
    expect(merged).toMatchObject({
      fullName: "Jane D.",
      title: "Engineer",
      skills: ["Go"],
      contactInformation: { email: "me@jane.dev", phone: "123" },
    });
  });
});
