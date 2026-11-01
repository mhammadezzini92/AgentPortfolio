import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { type NewLlmUsage, llmUsage } from "@/models/schemas";

export async function recordLlmUsage(usage: NewLlmUsage): Promise<number> {
  try {
    const [inserted] = await db.insert(llmUsage).values(usage).returning({ id: llmUsage.id });
    return inserted.id;
  } catch (error) {
    throw new Error(`Failed to record ${usage.operation} usage`, { cause: error });
  }
}

export type UsageTotals = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  requestsWithoutCost: number;
};

export async function getUsageTotals(): Promise<UsageTotals> {
  const row = await db
    .select({
      requests: sql<number>`count(*)`.mapWith(Number),
      inputTokens: sql<number>`coalesce(sum(${llmUsage.inputTokens}), 0)`.mapWith(Number),
      outputTokens: sql<number>`coalesce(sum(${llmUsage.outputTokens}), 0)`.mapWith(Number),
      costUsd: sql<number>`coalesce(sum(${llmUsage.costUsd}), 0)`.mapWith(Number),
      requestsWithoutCost: sql<number>`sum(case when ${llmUsage.costUsd} is null then 1 else 0 end)`.mapWith(Number),
    })
    .from(llmUsage)
    .get();
  return row ?? { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, requestsWithoutCost: 0 };
}
