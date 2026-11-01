import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type RateLimitDecision = { allowed: boolean; retryAfterSeconds: number };

// Fixed window counter in Turso. Serverless instances share nothing in memory,
// so the counter has to live in the database; the upsert makes increment-and-read atomic.
// In SET, every right-hand side sees the pre-update row, so both CASEs test the old window.
export async function consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitDecision> {
  const now = Math.floor(Date.now() / 1000);
  const row = await db.get<{ count: number; window_start: number }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, ${now}, 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start <= ${now - windowSeconds} then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start <= ${now - windowSeconds} then ${now} else rate_limits.window_start end
    returning count, window_start
  `);

  const allowed = row.count <= limit;
  return { allowed, retryAfterSeconds: allowed ? 0 : Math.max(1, row.window_start + windowSeconds - now) };
}

// Windows are at most a day long, so anything older than two days is dead weight.
const RATE_LIMIT_RETENTION_SECONDS = 2 * 24 * 60 * 60;

export async function deleteExpiredRateLimits(): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - RATE_LIMIT_RETENTION_SECONDS;
  try {
    await db.run(sql`delete from rate_limits where window_start < ${cutoff}`);
  } catch (error) {
    throw new Error("Failed to delete expired rate limits", { cause: error });
  }
}

// Vercel sets x-forwarded-for itself (client IP first) and strips spoofed values.
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
