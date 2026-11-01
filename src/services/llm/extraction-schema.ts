import { z } from "zod";
import type { SourceType } from "@/models/schemas";
import { sourceTypeYieldsEntities } from "@/services/knowledge/provenance";
import { normalizeForMatch } from "@/utils/text";
import { partialDateSchema, provenanceSchema } from "@/utils/validation";

// OpenAI strict structured output requires every field to be present,
// so "unknown" is expressed as null rather than an optional key.
const nullableText = z.string().nullable();

const evidence = z
  .string()
  .describe("One short line (under 200 characters) copied exactly from the document that supports this entry, without the [chunk N] marker.");

const technologies = z
  .array(z.string())
  .describe("Every technology, language, framework, database or service the document lists for this entry");

export const extractedProjectSchema = z.object({
  name: z.string(),
  description: nullableText,
  role: nullableText,
  architecture: nullableText,
  technologies,
  challenges: nullableText,
  solutions: nullableText,
  achievements: nullableText,
  evidence,
});

export const extractedExperienceSchema = z.object({
  company: z.string(),
  position: z.string(),
  description: nullableText,
  responsibilities: z.array(z.string()),
  technologies,
  startDate: nullableText.describe("YYYY or YYYY-MM"),
  endDate: nullableText.describe("YYYY or YYYY-MM; null if current"),
  evidence,
});

export const extractedProfileSchema = z.object({
  fullName: nullableText,
  title: nullableText,
  professionalSummary: nullableText,
  location: nullableText,
  skills: z.array(z.string()),
  languages: z.array(z.object({ name: z.string(), proficiency: nullableText })),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: nullableText,
      field: nullableText,
      startDate: nullableText,
      endDate: nullableText,
    }),
  ),
  contactInformation: z.object({
    email: nullableText,
    phone: nullableText,
    website: nullableText,
    linkedin: nullableText,
    github: nullableText,
  }),
  evidence,
});

export const chunkLabelSchema = z.object({
  chunkIndex: z.int(),
  provenance: provenanceSchema,
  projectName: nullableText.describe("Exact name of a project from `projects` this chunk is about, else null"),
});

export const knowledgeExtractionSchema = z.object({
  profile: extractedProfileSchema.nullable(),
  experiences: z
    .array(extractedExperienceSchema)
    .describe("Every role the owner held, including concurrent, contract and freelance roles"),
  projects: z
    .array(extractedProjectSchema)
    .describe("Every project, product, case study or portfolio entry the owner built or contributed to, including short archive or list entries. Do not skip any."),
  chunkLabels: z.array(chunkLabelSchema).describe("Only chunks whose provenance differs from the default, or that belong to a project"),
});

export type KnowledgeExtraction = z.infer<typeof knowledgeExtractionSchema>;
export type ExtractedProfile = z.infer<typeof extractedProfileSchema>;
export type ExtractedProject = z.infer<typeof extractedProjectSchema>;
export type ExtractedExperience = z.infer<typeof extractedExperienceSchema>;
export type ChunkLabel = z.infer<typeof chunkLabelSchema>;

const validDateOrNull = (value: string | null) => (value && partialDateSchema.safeParse(value).success ? value : null);
const validUrlOrNull = (value: string | null) => (value && z.url({ protocol: /^https?$/ }).safeParse(value).success ? value : null);
const validEmailOrNull = (value: string | null) => (value && z.email().safeParse(value).success ? value : null);

// Schema-valid output is not necessarily true output. Entities whose evidence quote
// isn't in the document are dropped: that's either a hallucination or an instruction
// smuggled into the document text that the model followed.
// PDF text splits words across lines with a hyphen ("post-\nproduction") that the model
// rejoins when quoting, so hyphens and the whitespace after them are ignored when matching.
function normalizeForEvidence(text: string): string {
  return normalizeForMatch(text.replace(/\u00AD/g, "").replace(/[-\u2010\u2011]\s*/g, ""));
}

const MIN_EVIDENCE_LINE_CHARS = 8;
const CHUNK_MARKER = /\[chunk \d+[^\]]*\]/g;

// Models often quote several lines of a passage (sometimes with the prompt's [chunk N]
// marker) and skip lines in between. Each substantial line must appear verbatim, and all
// of them within one chunk or two adjacent ones, so a quote stitched together from
// unrelated parts of the document doesn't ground an invented entity.
function isQuoteGrounded(quote: string, windows: string[]): boolean {
  const lines = quote
    .replace(CHUNK_MARKER, "\n")
    .split("\n")
    .map(normalizeForEvidence)
    .filter((line) => line.length >= MIN_EVIDENCE_LINE_CHARS);
  return lines.length > 0 && windows.some((window) => lines.every((line) => window.includes(line)));
}

function evidenceWindows(sections: string[]): string[] {
  const normalized = sections.map(normalizeForEvidence);
  if (normalized.length < 2) return normalized;
  return normalized.slice(0, -1).map((section, index) => `${section} ${normalized[index + 1]}`);
}

// dropped names what failed the evidence check, so a missing fact can be explained.
// sourceSections is the text the model saw, one entry per chunk in document order.
export function sanitizeExtraction(
  extraction: KnowledgeExtraction,
  sourceSections: string[],
  sourceType: SourceType,
  chunkCount: number,
): { extraction: KnowledgeExtraction; dropped: string[] } {
  const windows = evidenceWindows(sourceSections);
  const dropped: string[] = [];
  // Quotes of long structured passages are often mangled by the model, so an entity whose
  // identifying fields (name; company and position) all appear verbatim in one window is
  // kept too. An invented project or employer still fails: its name isn't in the document.
  const isAnchored = (anchors: string[]) => {
    const needles = anchors.map(normalizeForEvidence);
    return needles.every((needle) => needle.length >= 2) && windows.some((window) => needles.every((needle) => window.includes(needle)));
  };
  const isGrounded = (quote: string, label: string, anchors: string[]) => {
    const grounded = isQuoteGrounded(quote, windows) || isAnchored(anchors);
    if (!grounded) dropped.push(label);
    return grounded;
  };

  // A CV only describes its owner, so "general" there is always a mislabel (models tend
  // to file skill lists under it).
  const chunkLabels = extraction.chunkLabels
    .filter((label) => label.chunkIndex >= 0 && label.chunkIndex < chunkCount)
    .map((label) => (sourceType === "cv" && label.provenance === "general" ? { ...label, provenance: "personal" as const } : label));
  if (!sourceTypeYieldsEntities(sourceType)) {
    return {
      extraction: { profile: null, experiences: [], projects: [], chunkLabels: chunkLabels.map((l) => ({ ...l, projectName: null })) },
      dropped,
    };
  }

  const profile = extraction.profile && isGrounded(
    extraction.profile.evidence,
    `profile ${extraction.profile.fullName ?? ""}`.trim(),
    extraction.profile.fullName ? [extraction.profile.fullName] : [""],
  )
    ? {
        ...extraction.profile,
        education: extraction.profile.education.map((entry) => ({
          ...entry,
          startDate: validDateOrNull(entry.startDate),
          endDate: validDateOrNull(entry.endDate),
        })),
        contactInformation: {
          email: validEmailOrNull(extraction.profile.contactInformation.email),
          phone: extraction.profile.contactInformation.phone,
          website: validUrlOrNull(extraction.profile.contactInformation.website),
          linkedin: validUrlOrNull(extraction.profile.contactInformation.linkedin),
          github: validUrlOrNull(extraction.profile.contactInformation.github),
        },
      }
    : null;

  const experiences = extraction.experiences
    .filter((entry) => entry.company.trim() && entry.position.trim() && isGrounded(entry.evidence, `experience ${entry.position} at ${entry.company}`, [entry.company, entry.position]))
    .map((entry) => ({ ...entry, startDate: validDateOrNull(entry.startDate), endDate: validDateOrNull(entry.endDate) }));

  const projects = extraction.projects.filter((entry) => entry.name.trim() && isGrounded(entry.evidence, `project ${entry.name}`, [entry.name]));
  const projectNames = new Set(projects.map((project) => normalizeForMatch(project.name)));

  return {
    extraction: {
      profile,
      experiences,
      projects,
      chunkLabels: chunkLabels.map((label) => ({
        ...label,
        projectName: label.projectName && projectNames.has(normalizeForMatch(label.projectName)) ? label.projectName : null,
      })),
    },
    dropped,
  };
}
