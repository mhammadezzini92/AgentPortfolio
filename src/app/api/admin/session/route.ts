import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  sessionCookieOptions,
  verifyAdminPassword,
} from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { clientIp, consumeRateLimit } from "@/lib/rate-limit";

const LOGIN_ATTEMPTS_PER_WINDOW = 5;
const LOGIN_WINDOW_SECONDS = 15 * 60;

const loginSchema = z.object({ password: z.string().min(1).max(256) });

export async function POST(request: Request) {
  const limit = await consumeRateLimit(`login:${clientIp(request)}`, LOGIN_ATTEMPTS_PER_WINDOW, LOGIN_WINDOW_SECONDS);
  if (!limit.allowed) {
    return jsonError(429, "Too many login attempts", { retryAfterSeconds: limit.retryAfterSeconds });
  }

  const body = loginSchema.safeParse(await request.json().catch(() => null));
  if (!body.success || !verifyAdminPassword(body.data.password)) {
    return jsonError(401, "Invalid credentials");
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, createSessionToken(), sessionCookieOptions);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
