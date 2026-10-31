import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { authEnv } from "@/lib/env";

export const SESSION_COOKIE_NAME = "admin_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;

// Hashing first gives equal-length buffers, so timingSafeEqual doesn't leak the password length.
function constantTimeEquals(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

function sign(payload: string): string {
  return createHmac("sha256", authEnv().AUTH_SECRET).update(payload).digest("base64url");
}

export function verifyAdminPassword(candidate: string): boolean {
  return constantTimeEquals(candidate, authEnv().ADMIN_PASSWORD);
}

// Token is "<expiresAtUnixSeconds>.<hmac>". Stateless, so logout only clears the cookie;
// rotating AUTH_SECRET is the way to revoke every outstanding session.
export function createSessionToken(nowMs = Date.now()): string {
  const expiresAt = Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS;
  const payload = String(expiresAt);
  return `${payload}.${sign(payload)}`;
}

export function isValidSessionToken(token: string | undefined, nowMs = Date.now()): boolean {
  if (!token) return false;

  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length > 0) return false;
  if (!constantTimeEquals(signature, sign(payload))) return false;

  const expiresAt = Number(payload);
  return Number.isInteger(expiresAt) && expiresAt > Math.floor(nowMs / 1000);
}

export async function hasAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return isValidSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

// For admin server components. connection() defers the render to request time: with
// cacheComponents, cookies can be available while prerendering, so cookies() alone doesn't,
// and the expiry check (Date.now) and database reads must never run at build time.
export async function requireAdminSession(): Promise<void> {
  await connection();
  if (!(await hasAdminSession())) redirect("/admin/login");
}

// Only same-app admin paths, so the login form can't be used as an open redirect.
export function safeAdminRedirect(next: string | null): string {
  if (!next || !next.startsWith("/admin") || next.startsWith("//") || next.startsWith("/admin/login")) return "/admin";
  return next;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
} as const;
