import "server-only";
import { z } from "zod";

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const databaseSchema = z.object({
  TURSO_DATABASE_URL: z.string().min(1),
  TURSO_AUTH_TOKEN: z.string().min(1).optional(),
});

const blobSchema = z.object({
  BLOB_READ_WRITE_TOKEN: z.string().min(1),
});

const authSchema = z.object({
  ADMIN_PASSWORD: z.string().min(12, "ADMIN_PASSWORD must be at least 12 characters"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
});

const openaiSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_EXTRACTION_MODEL: z.string().min(1).default("gpt-4o-mini"),
  OPENAI_ANSWER_MODEL: z.string().min(1).default("gpt-4o-mini"),
  EXTRACTION_MAX_OUTPUT_TOKENS: positiveInt(4000),
});

const chatSchema = z.object({
  CHAT_MAX_INPUT_CHARS: positiveInt(1000),
  CHAT_MAX_OUTPUT_TOKENS: positiveInt(600),
  RETRIEVAL_TOP_K: positiveInt(8),
});

// Each consumer loads only its own section, so a missing OpenAI key
// doesn't break auth or the database during local work.
function load<T extends z.ZodType>(schema: T, section: string): z.infer<T> {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid ${section} environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export const databaseEnv = () => load(databaseSchema, "database");
export const blobEnv = () => load(blobSchema, "blob");
export const authEnv = () => load(authSchema, "auth");
export const openaiEnv = () => load(openaiSchema, "OpenAI");
export const chatEnv = () => load(chatSchema, "chat");
