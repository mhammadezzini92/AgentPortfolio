import { adminRoute, jsonError, parseId } from "@/lib/http";
import { deleteRecord, updateRecord } from "@/services/data-admin/data-admin-service";
import { editRequestSchema } from "@/services/data-admin/edit-schemas";
import { writeOutcomeResponse } from "@/app/api/admin/data/write-outcome-response";

type Context = RouteContext<"/api/admin/data/[table]/[id]">;

export const PATCH = adminRoute(async (request: Request, context: Context) => {
  const { table, id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id === null) return jsonError(400, "Invalid id");

  const body = editRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Expected { values, expectedUpdatedAt }");

  return writeOutcomeResponse(await updateRecord(table, id, body.data), 200);
});

export const DELETE = adminRoute(async (_request: Request, context: Context) => {
  const { table, id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id === null) return jsonError(400, "Invalid id");

  return writeOutcomeResponse(await deleteRecord(table, id), 204);
});
