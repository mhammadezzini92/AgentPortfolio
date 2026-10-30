import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/http";
import { listSourcesWithLatestJob } from "@/services/knowledge/source-repository";

export const GET = adminRoute(async () => {
  return NextResponse.json({ sources: await listSourcesWithLatestJob() });
});
