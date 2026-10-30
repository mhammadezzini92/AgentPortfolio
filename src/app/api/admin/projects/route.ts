import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/http";
import { listProjectsWithSources } from "@/services/knowledge/entity-repository";

export const GET = adminRoute(async () => {
  return NextResponse.json({ projects: await listProjectsWithSources() });
});
