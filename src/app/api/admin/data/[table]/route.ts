import { z } from "zod";
import { adminRoute, jsonError } from "@/lib/http";
import { createRecord } from "@/services/data-admin/data-admin-service";
import { writeOutcomeResponse } from "@/app/api/admin/data/write-outcome-response";

type Context = RouteContext<"/api/admin/data/[table]">;

const createRequestSchema = z.object({ values: z.record(z.string(), z.unknown()) });

export const POST = adminRoute(async (request: Request, context: Context) => {
  const { table } = await context.params;
  const body = createRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Expected { values }");

  return writeOutcomeResponse(await createRecord(table, body.data.values), 201);
});
