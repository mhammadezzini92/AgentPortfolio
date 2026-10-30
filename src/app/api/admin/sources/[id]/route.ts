import { NextResponse } from "next/server";
import { adminRoute, jsonError, parseId } from "@/lib/http";
import { staleProcessingCutoff } from "@/services/ingestion/ingestion-service";
import { listRelationshipsForSource } from "@/services/knowledge/entity-repository";
import { listJobsForSource } from "@/services/knowledge/job-repository";
import { deleteSource } from "@/services/knowledge/knowledge-service";
import { countChunksForSource, findSourceById } from "@/services/knowledge/source-repository";
import { db } from "@/lib/db";

type Context = RouteContext<"/api/admin/sources/[id]">;

export const GET = adminRoute(async (_request: Request, context: Context) => {
  const id = parseId((await context.params).id);
  if (id === null) return jsonError(400, "Invalid source id");

  const source = await findSourceById(id);
  if (!source) return jsonError(404, "Source not found");

  const [jobs, chunkCount, relationships] = await Promise.all([
    listJobsForSource(id),
    countChunksForSource(id),
    listRelationshipsForSource(db, id),
  ]);
  return NextResponse.json({ source, jobs, chunkCount, relationships });
});

export const DELETE = adminRoute(async (_request: Request, context: Context) => {
  const id = parseId((await context.params).id);
  if (id === null) return jsonError(400, "Invalid source id");

  const outcome = await deleteSource(id, staleProcessingCutoff());
  if (outcome === "not_found") return jsonError(404, "Source not found");
  if (outcome === "busy") return jsonError(409, "Source is being processed; try again when it finishes");
  return new Response(null, { status: 204 });
});
