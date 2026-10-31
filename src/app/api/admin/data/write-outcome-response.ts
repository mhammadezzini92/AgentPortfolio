import "server-only";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import type { WriteOutcome } from "@/services/data-admin/data-admin-service";

export function writeOutcomeResponse(outcome: WriteOutcome, successStatus: number): Response {
  switch (outcome.status) {
    case "saved":
      return successStatus === 204 ? new Response(null, { status: 204 }) : NextResponse.json({ id: outcome.id }, { status: successStatus });
    case "invalid":
      return jsonError(400, outcome.message);
    case "not_found":
      return jsonError(404, "Row not found");
    case "conflict":
      return jsonError(409, outcome.message);
    case "not_allowed":
      return jsonError(405, "This table doesn't allow that operation");
  }
}
