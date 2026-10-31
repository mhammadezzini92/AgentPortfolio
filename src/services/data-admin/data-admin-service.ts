import "server-only";
import { z } from "zod";
import {
  deleteEntityWithLinks,
  findEditableRow,
  insertExperience,
  insertProfileIfAbsent,
  insertProject,
  updateChunk,
  updateExperienceIfUnchanged,
  updateProfileIfUnchanged,
  updateProjectIfUnchanged,
  updateSourceIfUnchanged,
} from "@/services/data-admin/data-admin-repository";
import {
  chunkEditSchema,
  experienceEditSchema,
  profileEditSchema,
  projectEditSchema,
  sourceEditSchema,
} from "@/services/data-admin/edit-schemas";

export type WriteOutcome =
  | { status: "saved"; id: number }
  | { status: "invalid"; message: string }
  | { status: "not_found" }
  | { status: "conflict"; message: string }
  | { status: "not_allowed" };

type EditRequest = { values: Record<string, unknown>; expectedUpdatedAt: number | null };

const STALE_MESSAGE = "This row changed since you opened it (a reprocess or another tab). Reload and apply your edit again.";

function validate<T>(schema: z.ZodType<T>, values: unknown): { data: T } | { message: string } {
  const parsed = schema.safeParse(values);
  return parsed.success ? { data: parsed.data } : { message: z.prettifyError(parsed.error) };
}

async function missOutcome(tableName: string, id: number): Promise<WriteOutcome> {
  return (await findEditableRow(tableName, id)) ? { status: "conflict", message: STALE_MESSAGE } : { status: "not_found" };
}

// Runs one optimistic update: validates, requires the version token, and turns a
// zero-row update into conflict or not_found.
async function guardedUpdate<T>(
  tableName: string,
  id: number,
  request: EditRequest,
  schema: z.ZodType<T>,
  update: (values: T, expectedUpdatedAt: number) => Promise<boolean>,
): Promise<WriteOutcome> {
  const parsed = validate(schema, request.values);
  if ("message" in parsed) return { status: "invalid", message: parsed.message };
  if (request.expectedUpdatedAt === null) return { status: "invalid", message: "Missing row version; reload the page" };

  if (await update(parsed.data, request.expectedUpdatedAt)) return { status: "saved", id };
  return missOutcome(tableName, id);
}

async function updateChunkRecord(id: number, values: unknown): Promise<WriteOutcome> {
  const parsed = validate(chunkEditSchema, values);
  if ("message" in parsed) return { status: "invalid", message: parsed.message };
  // Friendly message only; the foreign key still rejects a project deleted in between.
  if (parsed.data.projectId !== null && !(await findEditableRow("projects", parsed.data.projectId))) {
    return { status: "invalid", message: "That project no longer exists" };
  }
  return (await updateChunk(id, parsed.data)) ? { status: "saved", id } : { status: "not_found" };
}

export async function updateRecord(tableName: string, id: number, request: EditRequest): Promise<WriteOutcome> {
  switch (tableName) {
    case "profile":
      return guardedUpdate(tableName, id, request, profileEditSchema, updateProfileIfUnchanged);
    case "projects":
      return guardedUpdate(tableName, id, request, projectEditSchema, (values, expected) => updateProjectIfUnchanged(id, values, expected));
    case "experiences":
      return guardedUpdate(tableName, id, request, experienceEditSchema, (values, expected) => updateExperienceIfUnchanged(id, values, expected));
    case "knowledge_sources":
      return guardedUpdate(tableName, id, request, sourceEditSchema, (values, expected) => updateSourceIfUnchanged(id, values, expected));
    case "knowledge_chunks":
      return updateChunkRecord(id, request.values);
    default:
      return { status: "not_allowed" };
  }
}

export async function createRecord(tableName: string, values: unknown): Promise<WriteOutcome> {
  switch (tableName) {
    case "profile": {
      const parsed = validate(profileEditSchema, values);
      if ("message" in parsed) return { status: "invalid", message: parsed.message };
      if (!(await insertProfileIfAbsent(parsed.data))) return { status: "conflict", message: "A profile already exists; edit it instead" };
      return { status: "saved", id: 1 };
    }
    case "projects": {
      const parsed = validate(projectEditSchema, values);
      if ("message" in parsed) return { status: "invalid", message: parsed.message };
      return { status: "saved", id: await insertProject(parsed.data) };
    }
    case "experiences": {
      const parsed = validate(experienceEditSchema, values);
      if ("message" in parsed) return { status: "invalid", message: parsed.message };
      return { status: "saved", id: await insertExperience(parsed.data) };
    }
    default:
      return { status: "not_allowed" };
  }
}

export async function deleteRecord(tableName: string, id: number): Promise<WriteOutcome> {
  const entityType = tableName === "projects" ? "project" : tableName === "experiences" ? "experience" : null;
  if (!entityType) return { status: "not_allowed" };
  return (await deleteEntityWithLinks(entityType, id)) ? { status: "saved", id } : { status: "not_found" };
}
