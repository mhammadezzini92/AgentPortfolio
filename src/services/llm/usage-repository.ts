import "server-only";
import { db } from "@/lib/db";
import { type NewLlmUsage, llmUsage } from "@/models/schemas";

export async function recordLlmUsage(usage: NewLlmUsage): Promise<void> {
  try {
    await db.insert(llmUsage).values(usage);
  } catch (error) {
    throw new Error(`Failed to record ${usage.operation} usage`, { cause: error });
  }
}
