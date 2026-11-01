import "server-only";
import { desc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { type ChatQuestion, type NewChatQuestion, chatQuestions } from "@/models/schemas";

const RETENTION_SECONDS = 30 * 24 * 60 * 60;

export async function recordChatQuestion(question: NewChatQuestion): Promise<void> {
  try {
    await db.insert(chatQuestions).values(question);
  } catch (error) {
    throw new Error("Failed to record chat question", { cause: error });
  }
}

// "Unanswered" is a heuristic: nothing was retrieved, or the request didn't complete.
// An answer where the model itself said "I don't know" despite some matches isn't caught.
export async function listUnansweredQuestions(limit: number): Promise<ChatQuestion[]> {
  return db
    .select()
    .from(chatQuestions)
    .where(or(eq(chatQuestions.retrievedChunkCount, 0), sql`${chatQuestions.outcome} != 'answered'`))
    .orderBy(desc(chatQuestions.id))
    .limit(limit);
}

export async function deleteExpiredChatQuestions(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_SECONDS * 1000);
  try {
    await db.delete(chatQuestions).where(lt(chatQuestions.createdAt, cutoff));
  } catch (error) {
    throw new Error("Failed to delete expired chat questions", { cause: error });
  }
}
