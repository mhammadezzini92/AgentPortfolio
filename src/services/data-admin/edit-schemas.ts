import { z } from "zod";
import {
  contactInformationSchema,
  educationSchema,
  languageSchema,
  partialDateSchema,
  provenanceSchema,
  sourceTypeSchema,
} from "@/utils/validation";

const requiredText = z.string().trim().min(1, "Required").max(300);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null);
const stringList = z.array(z.string().trim().min(1).max(200)).max(200);

export const profileEditSchema = z.object({
  fullName: requiredText,
  title: optionalText(300),
  location: optionalText(300),
  professionalSummary: optionalText(5000),
  skills: stringList,
  languages: z.array(languageSchema).max(50),
  education: z.array(educationSchema).max(50),
  contactInformation: contactInformationSchema,
});

export const projectEditSchema = z.object({
  name: requiredText,
  description: optionalText(5000),
  role: optionalText(300),
  architecture: optionalText(5000),
  technologies: stringList,
  challenges: optionalText(5000),
  solutions: optionalText(5000),
  achievements: optionalText(5000),
});

export const experienceEditSchema = z.object({
  company: requiredText,
  position: requiredText,
  startDate: partialDateSchema.nullable(),
  endDate: partialDateSchema.nullable(),
  description: optionalText(5000),
  responsibilities: stringList,
  technologies: stringList,
});

export const chunkEditSchema = z.object({
  provenance: provenanceSchema,
  projectId: z.number().int().positive().nullable(),
  heading: optionalText(300),
  content: z.string().trim().min(1, "Required").max(20_000),
});

export const sourceEditSchema = z.object({
  title: optionalText(200),
  sourceType: sourceTypeSchema,
});

// Every edit carries the row's updated_at (unix seconds) as read by the form, so a save
// can't silently overwrite a change made meanwhile by a reprocess or another tab.
export const editRequestSchema = z.object({
  values: z.record(z.string(), z.unknown()),
  expectedUpdatedAt: z.number().int().nullable(),
});

export type ProfileEdit = z.infer<typeof profileEditSchema>;
export type ProjectEdit = z.infer<typeof projectEditSchema>;
export type ExperienceEdit = z.infer<typeof experienceEditSchema>;
export type ChunkEdit = z.infer<typeof chunkEditSchema>;
export type SourceEdit = z.infer<typeof sourceEditSchema>;
