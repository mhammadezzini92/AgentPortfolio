import { describe, expect, it, vi } from "vitest";
import type { Experience, Profile, Project } from "@/models/schemas";

vi.mock("server-only", () => ({}));
// Only the pure renderer is under test; the loader's database access isn't exercised.
vi.mock("@/lib/db", () => ({ db: {} }));
const { renderProfileCard } = await import("@/services/chat/profile-card");

const now = new Date();

const profile: Profile = {
  id: 1,
  fullName: "Jane Doe",
  title: "Backend Engineer",
  professionalSummary: null,
  location: "Beirut",
  skills: ["Go", "PostgreSQL"],
  languages: [{ name: "Arabic", proficiency: "Native" }, { name: "English" }],
  education: [{ institution: "AUB", degree: "BSc", field: "Computer Science", startDate: "2012", endDate: "2016" }],
  contactInformation: { email: "jane@example.com" },
  manuallyEditedAt: null,
  updatedAt: now,
};

function experience(id: number, position: string, startDate: string | null, endDate: string | null): Experience {
  return {
    id, company: `Company ${id}`, position, description: null, responsibilities: [], technologies: [],
    startDate, endDate, manuallyEditedAt: null, createdAt: now, updatedAt: now,
  };
}

const project = (name: string) => ({ id: 1, name }) as Project;

describe("renderProfileCard", () => {
  it("renders profile facts, roles newest first with the current role on top, and project names", () => {
    const card = renderProfileCard(
      profile,
      [experience(1, "Intern", "2015", "2016"), experience(2, "Lead", "2021", null), experience(3, "Engineer", "2016-06", "2021")],
      [project("Ledger"), project("Atlas")],
    );

    expect(card?.ownerName).toBe("Jane Doe");
    expect(card?.text).toBe(
      [
        "Name: Jane Doe",
        "Title: Backend Engineer",
        "Location: Beirut",
        "Skills: Go, PostgreSQL",
        "Languages: Arabic (Native), English",
        "Education: BSc in Computer Science, AUB (2012–2016)",
        "Contact: email jane@example.com",
        "Roles:",
        "- Lead at Company 2 (2021–present)",
        "- Engineer at Company 3 (2016-06–2021)",
        "- Intern at Company 1 (2015–2016)",
        "Projects: Ledger, Atlas",
      ].join("\n"),
    );
  });

  it("still renders roles and projects without a profile, with no owner name", () => {
    const card = renderProfileCard(undefined, [], [project("Ledger")]);
    expect(card).toEqual({ ownerName: null, text: "Projects: Ledger" });
  });

  it("returns null when there's nothing to say and caps long cards", () => {
    expect(renderProfileCard(undefined, [], [])).toBeNull();
    const long = renderProfileCard({ ...profile, professionalSummary: "x".repeat(5000) }, [], []);
    expect(long!.text.length).toBe(2001);
    expect(long!.text.endsWith("…")).toBe(true);
  });
});
