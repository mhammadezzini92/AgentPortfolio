import type { NewExperience, NewProfile, NewProject } from "@/models/schemas";
import type {
  ExtractedExperience,
  ExtractedProfile,
  ExtractedProject,
} from "@/services/llm/extraction-schema";
import type { ContactInformation, Education, Language } from "@/utils/validation";
import { normalizeForMatch } from "@/utils/text";

// Merge policy (agreed in the Phase 2 plan): a non-null value from the newer source
// overwrites the stored one; arrays are unioned so no source can erase another's facts.
// Rows an admin edited by hand flip this: stored values win, extraction only fills empty
// fields, and lists aren't unioned so items the admin removed don't come back.

function pick<T>(incoming: T | null | undefined, existing: T | null | undefined): T | null {
  return incoming ?? existing ?? null;
}

const isEdited = (existing: { manuallyEditedAt?: Date | null } | undefined) => existing?.manuallyEditedAt != null;

function pickField<T>(edited: boolean, incoming: T | null | undefined, existing: T | null | undefined): T | null {
  return edited ? pick(existing, incoming) : pick(incoming, existing);
}

function unionBy<T>(existing: T[], incoming: T[], key: (item: T) => string): T[] {
  const merged = new Map<string, T>();
  for (const item of existing) merged.set(key(item), item);
  for (const item of incoming) {
    const itemKey = key(item);
    if (!merged.has(itemKey)) merged.set(itemKey, item);
  }
  return [...merged.values()];
}

export const unionStrings = (existing: string[], incoming: string[]) =>
  unionBy(
    existing,
    incoming.map((value) => value.trim()).filter(Boolean),
    normalizeForMatch,
  );

function mergeList<T>(edited: boolean, existing: T[] | undefined, incoming: T[], union: (a: T[], b: T[]) => T[]): T[] {
  const current = existing ?? [];
  if (edited && current.length > 0) return current;
  return union(current, incoming);
}

export const projectKey = (name: string) => normalizeForMatch(name);
export const experienceKey = (company: string, position: string) =>
  `${normalizeForMatch(company)}\u0000${normalizeForMatch(position)}`;

function withoutNulls<T extends Record<string, unknown>>(value: T): Partial<{ [K in keyof T]: NonNullable<T[K]> }> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null)) as Partial<{
    [K in keyof T]: NonNullable<T[K]>;
  }>;
}

// Returns null when there's no stored profile and the source didn't name the owner:
// full_name is required and a nameless profile row is worse than none.
export function mergeProfile(existing: NewProfile | undefined, incoming: ExtractedProfile): NewProfile | null {
  const edited = isEdited(existing);
  const fullName = pickField(edited, incoming.fullName, existing?.fullName);
  if (!fullName) return null;

  const languages: Language[] = incoming.languages.map((language) => withoutNulls(language) as Language);
  const education: Education[] = incoming.education.map((entry) => withoutNulls(entry) as Education);
  const contact = withoutNulls(incoming.contactInformation) as ContactInformation;
  const storedContact = existing?.contactInformation ?? {};

  return {
    id: 1,
    fullName,
    title: pickField(edited, incoming.title, existing?.title),
    professionalSummary: pickField(edited, incoming.professionalSummary, existing?.professionalSummary),
    location: pickField(edited, incoming.location, existing?.location),
    skills: mergeList(edited, existing?.skills, incoming.skills, unionStrings),
    languages: mergeList(edited, existing?.languages, languages, (a, b) => unionBy(a, b, (l) => normalizeForMatch(l.name))),
    education: mergeList(edited, existing?.education, education, (a, b) =>
      unionBy(a, b, (e) => `${normalizeForMatch(e.institution)}\u0000${normalizeForMatch(e.degree ?? "")}`),
    ),
    contactInformation: edited ? { ...contact, ...storedContact } : { ...storedContact, ...contact },
  };
}

export function mergeProject(existing: NewProject | undefined, incoming: ExtractedProject): NewProject {
  const edited = isEdited(existing);
  return {
    name: existing?.name ?? incoming.name.trim(),
    description: pickField(edited, incoming.description, existing?.description),
    role: pickField(edited, incoming.role, existing?.role),
    architecture: pickField(edited, incoming.architecture, existing?.architecture),
    technologies: mergeList(edited, existing?.technologies, incoming.technologies, unionStrings),
    challenges: pickField(edited, incoming.challenges, existing?.challenges),
    solutions: pickField(edited, incoming.solutions, existing?.solutions),
    achievements: pickField(edited, incoming.achievements, existing?.achievements),
  };
}

export function mergeExperience(existing: NewExperience | undefined, incoming: ExtractedExperience): NewExperience {
  const edited = isEdited(existing);
  return {
    company: existing?.company ?? incoming.company.trim(),
    position: existing?.position ?? incoming.position.trim(),
    description: pickField(edited, incoming.description, existing?.description),
    responsibilities: mergeList(edited, existing?.responsibilities, incoming.responsibilities, unionStrings),
    technologies: mergeList(edited, existing?.technologies, incoming.technologies, unionStrings),
    startDate: pickField(edited, incoming.startDate, existing?.startDate),
    // A null end date means "current", so it only overwrites when the source has a date.
    // An edited row keeps its null: the admin may have marked the role as current on purpose.
    endDate: edited ? (existing?.endDate ?? null) : pick(incoming.endDate, existing?.endDate),
  };
}
