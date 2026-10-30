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
  .describe("A short verbatim quote (under 300 characters) copied exactly from the document that supports this entry.");

export const extractedProjectSchema = z.object({
  name: z.string(),
  description: nullableText,
  role: nullableText,
  architecture: nullableText,
  technologies: z.array(z.string()),
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
  technologies: z.array(z.string()),
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
  experiences: z.array(extractedExperienceSchema),
  projects: z.array(extractedProjectSchema),
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
export function sanitizeExtraction(
  extraction: KnowledgeExtraction,
  sourceText: string,
  sourceType: SourceType,
  chunkCount: number,
): KnowledgeExtraction {
  const haystack = normalizeForMatch(sourceText);
  const isGrounded = (quote: string) => {
    const needle = normalizeForMatch(quote);
    return needle.length >= 8 && haystack.includes(needle);
  };

  const chunkLabels = extraction.chunkLabels.filter(
    (label) => label.chunkIndex >= 0 && label.chunkIndex < chunkCount,
  );
  if (!sourceTypeYieldsEntities(sourceType)) {
    return { profile: null, experiences: [], projects: [], chunkLabels: chunkLabels.map((l) => ({ ...l, projectName: null })) };
  }

  const profile = extraction.profile && isGrounded(extraction.profile.evidence)
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
    .filter((entry) => entry.company.trim() && entry.position.trim() && isGrounded(entry.evidence))
    .map((entry) => ({ ...entry, startDate: validDateOrNull(entry.startDate), endDate: validDateOrNull(entry.endDate) }));

  const projects = extraction.projects.filter((entry) => entry.name.trim() && isGrounded(entry.evidence));
  const projectNames = new Set(projects.map((project) => normalizeForMatch(project.name)));

  return {
    profile,
    experiences,
    projects,
    chunkLabels: chunkLabels.map((label) => ({
      ...label,
      projectName: label.projectName && projectNames.has(normalizeForMatch(label.projectName)) ? label.projectName : null,
    })),
  };
}
