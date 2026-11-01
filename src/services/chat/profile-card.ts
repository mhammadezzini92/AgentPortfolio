import "server-only";
import { db } from "@/lib/db";
import type { Experience, Profile, Project } from "@/models/schemas";
import { getProfile, listExperiences, listProjects } from "@/services/knowledge/entity-repository";

// Sent with every question, so it stays small: about 500 tokens at most.
const MAX_CARD_CHARS = 2000;

export type ProfileCard = { ownerName: string | null; text: string };

function dateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "";
  return ` (${start ?? "?"}–${end ?? "present"})`;
}

// Newest first; "YYYY" and "YYYY-MM" strings sort correctly as text, and a current role
// (no end date) ranks above finished ones.
function byRecency(a: Experience, b: Experience): number {
  return (b.endDate ?? "9999").localeCompare(a.endDate ?? "9999") || (b.startDate ?? "").localeCompare(a.startDate ?? "");
}

export function renderProfileCard(profile: Profile | undefined, experiences: Experience[], projects: Project[]): ProfileCard | null {
  const lines: string[] = [];
  if (profile) {
    lines.push(`Name: ${profile.fullName}`);
    if (profile.title) lines.push(`Title: ${profile.title}`);
    if (profile.location) lines.push(`Location: ${profile.location}`);
    if (profile.professionalSummary) lines.push(`Summary: ${profile.professionalSummary}`);
    if (profile.skills.length > 0) lines.push(`Skills: ${profile.skills.join(", ")}`);
    if (profile.languages.length > 0) {
      lines.push(`Languages: ${profile.languages.map((l) => (l.proficiency ? `${l.name} (${l.proficiency})` : l.name)).join(", ")}`);
    }
    for (const entry of profile.education) {
      const degree = [entry.degree, entry.field].filter(Boolean).join(" in ");
      lines.push(`Education: ${[degree, entry.institution].filter(Boolean).join(", ")}${dateRange(entry.startDate ?? null, entry.endDate ?? null)}`);
    }
    const contact = Object.entries(profile.contactInformation).filter(([, value]) => value);
    if (contact.length > 0) lines.push(`Contact: ${contact.map(([key, value]) => `${key} ${value}`).join(", ")}`);
  }
  if (experiences.length > 0) {
    lines.push("Roles:");
    for (const role of [...experiences].sort(byRecency)) {
      lines.push(`- ${role.position} at ${role.company}${dateRange(role.startDate, role.endDate)}`);
    }
  }
  if (projects.length > 0) lines.push(`Projects: ${projects.map((project) => project.name).join(", ")}`);
  if (lines.length === 0) return null;

  const text = lines.join("\n");
  return {
    ownerName: profile?.fullName ?? null,
    text: text.length > MAX_CARD_CHARS ? `${text.slice(0, MAX_CARD_CHARS)}…` : text,
  };
}

export async function loadProfileCard(): Promise<ProfileCard | null> {
  const [profile, experiences, projects] = await Promise.all([getProfile(db), listExperiences(db), listProjects(db)]);
  return renderProfileCard(profile, experiences, projects);
}
