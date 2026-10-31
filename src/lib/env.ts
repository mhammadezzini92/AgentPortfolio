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

// OpenRouter ids are "vendor/model"; a bare "gpt-4o-mini" fails at request time, so catch it at boot.
const openRouterModel = z
  .string()
  .regex(/^[\w.-]+\/[\w.:-]+$/, 'OpenRouter model ids look like "openai/gpt-4o-mini"');

const openRouterSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_EXTRACTION_MODEL: openRouterModel.default("openai/gpt-4o-mini"),
  OPENROUTER_ANSWER_MODEL: openRouterModel.default("openai/gpt-4o-mini"),
  EXTRACTION_MAX_OUTPUT_TOKENS: positiveInt(4000),
});

const chatSchema = z.object({
  CHAT_MAX_INPUT_CHARS: positiveInt(1000),
  CHAT_MAX_OUTPUT_TOKENS: positiveInt(600),
  RETRIEVAL_TOP_K: positiveInt(8),
  // Caps the retrieved text sent to the answer model, which keeps per-question cost predictable.
  RETRIEVAL_MAX_CONTEXT_CHARS: positiveInt(6000),
});

// Each consumer loads only its own section, so a missing OpenRouter key
// doesn't break auth or the database during local work.
// Blank lines in .env ("KEY=") arrive as "", which should mean "unset" so optional
// values stay undefined and defaults apply.
function load<T extends z.ZodType>(schema: T, section: string): z.infer<T> {
  const defined = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ""));
  const parsed = schema.safeParse(defined);
  if (!parsed.success) {
    throw new Error(`Invalid ${section} environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export const databaseEnv = () => load(databaseSchema, "database");
export const blobEnv = () => load(blobSchema, "blob");
export const authEnv = () => load(authSchema, "auth");
export const openRouterEnv = () => load(openRouterSchema, "OpenRouter");
export const chatEnv = () => load(chatSchema, "chat");
