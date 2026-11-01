import { NextResponse, after } from "next/server";
import { z } from "zod";
import { adminRoute, jsonError } from "@/lib/http";
import {
  claimSourceForIngestion,
  createUploadSource,
  runIngestionJob,
} from "@/services/ingestion/ingestion-service";
import { hasExpectedFileSignature, uploadFileSchema } from "@/utils/validation";

// Must match INGESTION_MAX_DURATION_SECONDS; Next requires a literal here.
export const maxDuration = 120;

const uploadFieldsSchema = z.object({
  sourceType: z.enum(["cv", "portfolio", "upload"]).default("cv"),
  title: z.string().trim().min(1).max(200).nullable().default(null),
});

export const POST = adminRoute(async (request: Request) => {
  const form = await request.formData().catch(() => null);
  if (!form) return jsonError(400, "Expected multipart/form-data");

  const file = uploadFileSchema.safeParse(form.get("file"));
  if (!file.success) return jsonError(400, z.prettifyError(file.error));

  const fields = uploadFieldsSchema.safeParse({
    sourceType: form.get("sourceType") ?? undefined,
    title: form.get("title") || null,
  });
  if (!fields.success) return jsonError(400, z.prettifyError(fields.error));

  const bytes = Buffer.from(await file.data.arrayBuffer());
  if (!hasExpectedFileSignature(bytes, file.data.type)) {
    return jsonError(400, "File contents do not match its declared type");
  }

  const source = await createUploadSource({ file: file.data, bytes, ...fields.data });
  const claim = await claimSourceForIngestion(source.id);
  if (claim.status !== "claimed") return jsonError(500, "Could not start ingestion");

  after(() => runIngestionJob(claim.source, claim.job, { force: false }));
  return NextResponse.json({ sourceId: source.id, jobId: claim.job.id }, { status: 202 });
});
