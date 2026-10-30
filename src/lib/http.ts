import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminSession } from "@/lib/auth";
import { logger } from "@/lib/logger";

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

const idSchema = z.coerce.number().int().positive();

export function parseId(raw: string): number | null {
  const parsed = idSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// Every admin handler goes through this: proxy.ts is the first gate, this is the second,
// and unexpected errors become a generic 500 without leaking internals to the client.
export function adminRoute<Context>(handler: (request: Request, context: Context) => Promise<Response>) {
  return async (request: Request, context: Context): Promise<Response> => {
    if (!(await hasAdminSession())) return jsonError(401, "Unauthorized");
    try {
      return await handler(request, context);
    } catch (error) {
      logger.error("Admin route failed", { method: request.method, path: new URL(request.url).pathname, error });
      return jsonError(500, "Internal error");
    }
  };
}
