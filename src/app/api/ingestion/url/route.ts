import { NextResponse, after } from "next/server";
import { z } from "zod";
import { adminRoute, jsonError } from "@/lib/http";
import {
  DuplicateSourceError,
  claimSourceForIngestion,
  createUrlSource,
  runIngestionJob,
} from "@/services/ingestion/ingestion-service";
import { publicHttpUrlSchema } from "@/utils/validation";

// Must match INGESTION_MAX_DURATION_SECONDS; Next requires a literal here.
export const maxDuration = 120;

const importUrlSchema = z.object({
  url: publicHttpUrlSchema,
  sourceType: z.enum(["portfolio", "github", "article", "documentation"]),
  title: z.string().trim().min(1).max(200).nullable().default(null),
});

export const POST = adminRoute(async (request: Request) => {
  const body = importUrlSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, z.prettifyError(body.error));

  try {
    const source = await createUrlSource(body.data.url, body.data.sourceType, body.data.title);
    const claim = await claimSourceForIngestion(source.id);
    if (claim.status !== "claimed") return jsonError(500, "Could not start ingestion");

    after(() => runIngestionJob(claim.source, claim.job, { force: false }));
    return NextResponse.json({ sourceId: source.id, jobId: claim.job.id }, { status: 202 });
  } catch (error) {
    if (error instanceof DuplicateSourceError) return jsonError(409, error.message);
    throw error;
  }
});
