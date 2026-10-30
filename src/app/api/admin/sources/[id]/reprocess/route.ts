import { NextResponse, after } from "next/server";
import { z } from "zod";
import { adminRoute, jsonError, parseId } from "@/lib/http";
import { claimSourceForIngestion, runIngestionJob } from "@/services/ingestion/ingestion-service";

// Must match INGESTION_MAX_DURATION_SECONDS; Next requires a literal here.
export const maxDuration = 120;

// Covers both "retry failed" and "reprocess updated": the run refetches the source and
// skips extraction when the content hash is unchanged, unless force is set.
const reprocessSchema = z.object({ force: z.boolean().default(false) });

export const POST = adminRoute(async (request: Request, context: RouteContext<"/api/admin/sources/[id]/reprocess">) => {
  const id = parseId((await context.params).id);
  if (id === null) return jsonError(400, "Invalid source id");

  const body = reprocessSchema.safeParse((await request.json().catch(() => null)) ?? {});
  if (!body.success) return jsonError(400, z.prettifyError(body.error));

  const claim = await claimSourceForIngestion(id);
  if (claim.status === "not_found") return jsonError(404, "Source not found");
  if (claim.status === "busy") return jsonError(409, "Source is already being processed");

  after(() => runIngestionJob(claim.source, claim.job, body.data));
  return NextResponse.json({ sourceId: id, jobId: claim.job.id }, { status: 202 });
});
