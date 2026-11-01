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
// fields, and lists aren't unioned so items the admin removed don't come back. The same
// fill-only mode applies to sources that may not overwrite facts (cover letters, notes).

function pick<T>(incoming: T | null | undefined, existing: T | null | undefined): T | null {
  return incoming ?? existing ?? null;
}

export type MergeOptions = { fillOnly?: boolean };

const keepsExisting = (existing: { manuallyEditedAt?: Date | null } | undefined, options: MergeOptions) =>
  existing?.manuallyEditedAt != null || options.fillOnly === true;

function pickField<T>(keepExisting: boolean, incoming: T | null | undefined, existing: T | null | undefined): T | null {
  return keepExisting ? pick(existing, incoming) : pick(incoming, existing);
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

function mergeList<T>(keepExisting: boolean, existing: T[] | undefined, incoming: T[], union: (a: T[], b: T[]) => T[]): T[] {
  const current = existing ?? [];
  if (keepExisting && current.length > 0) return current;
  return union(current, incoming);
}

export const projectKey = (name: string) => normalizeForMatch(name);
export const experienceKey = (company: string, position: string) =>
  `${normalizeForMatch(company)}\u0000${normalizeForMatch(position)}`;

// The CV and the portfolio often title the same role differently ("Senior Backend Engineer
// (Contract)" vs "Senior Backend Engineer / Tech Lead"). The same employer and start month
// is the same engagement, whatever the title says.
export function findSameEngagement(
  stored: Iterable<NewExperience>,
  incoming: { company: string; startDate: string | null },
): NewExperience | undefined {
  if (!incoming.startDate) return undefined;
  const company = normalizeForMatch(incoming.company);
  for (const candidate of stored) {
    if (candidate.startDate === incoming.startDate && normalizeForMatch(candidate.company) === company) return candidate;
  }
  return undefined;
}

function withoutNulls<T extends Record<string, unknown>>(value: T): Partial<{ [K in keyof T]: NonNullable<T[K]> }> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null)) as Partial<{
    [K in keyof T]: NonNullable<T[K]>;
  }>;
}

// Returns null when there's no stored profile and the source didn't name the owner:
// full_name is required and a nameless profile row is worse than none.
export function mergeProfile(existing: NewProfile | undefined, incoming: ExtractedProfile, options: MergeOptions = {}): NewProfile | null {
  const keepExisting = keepsExisting(existing, options);
  const fullName = pickField(keepExisting, incoming.fullName, existing?.fullName);
  if (!fullName) return null;

  const languages: Language[] = incoming.languages.map((language) => withoutNulls(language) as Language);
  const education: Education[] = incoming.education.map((entry) => withoutNulls(entry) as Education);
  const contact = withoutNulls(incoming.contactInformation) as ContactInformation;
  const storedContact = existing?.contactInformation ?? {};

  return {
    id: 1,
    fullName,
    title: pickField(keepExisting, incoming.title, existing?.title),
    professionalSummary: pickField(keepExisting, incoming.professionalSummary, existing?.professionalSummary),
    location: pickField(keepExisting, incoming.location, existing?.location),
    skills: mergeList(keepExisting, existing?.skills, incoming.skills, unionStrings),
    languages: mergeList(keepExisting, existing?.languages, languages, (a, b) => unionBy(a, b, (l) => normalizeForMatch(l.name))),
    education: mergeList(keepExisting, existing?.education, education, (a, b) =>
      unionBy(a, b, (e) => `${normalizeForMatch(e.institution)}\u0000${normalizeForMatch(e.degree ?? "")}`),
    ),
    contactInformation: keepExisting ? { ...contact, ...storedContact } : { ...storedContact, ...contact },
  };
}

export function mergeProject(existing: NewProject | undefined, incoming: ExtractedProject, options: MergeOptions = {}): NewProject {
  const keepExisting = keepsExisting(existing, options);
  return {
    name: existing?.name ?? incoming.name.trim(),
    description: pickField(keepExisting, incoming.description, existing?.description),
    role: pickField(keepExisting, incoming.role, existing?.role),
    architecture: pickField(keepExisting, incoming.architecture, existing?.architecture),
    technologies: mergeList(keepExisting, existing?.technologies, incoming.technologies, unionStrings),
    challenges: pickField(keepExisting, incoming.challenges, existing?.challenges),
    solutions: pickField(keepExisting, incoming.solutions, existing?.solutions),
    achievements: pickField(keepExisting, incoming.achievements, existing?.achievements),
  };
}

export function mergeExperience(existing: NewExperience | undefined, incoming: ExtractedExperience, options: MergeOptions = {}): NewExperience {
  const keepExisting = keepsExisting(existing, options);
  return {
    company: existing?.company ?? incoming.company.trim(),
    position: existing?.position ?? incoming.position.trim(),
    description: pickField(keepExisting, incoming.description, existing?.description),
    responsibilities: mergeList(keepExisting, existing?.responsibilities, incoming.responsibilities, unionStrings),
    technologies: mergeList(keepExisting, existing?.technologies, incoming.technologies, unionStrings),
    startDate: pickField(keepExisting, incoming.startDate, existing?.startDate),
    // A null end date means "current", so it only overwrites when the source has a date.
    // A kept row keeps its null: the admin may have marked the role as current on purpose.
    endDate: keepExisting ? (existing?.endDate ?? null) : pick(incoming.endDate, existing?.endDate),
  };
}
