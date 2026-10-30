import "server-only";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/models/schemas";
import { databaseEnv } from "@/lib/env";

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = databaseEnv();

const client = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });

export const db = drizzle(client, { schema });

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
// Repositories accept either, so the same function works standalone or inside a transaction.
export type DbExecutor = Database | Transaction;

// Drizzle wraps driver errors, so the libSQL message can be a few causes deep.
export function isUniqueViolation(error: unknown, qualifiedColumn: string): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (current.message.includes(`UNIQUE constraint failed: ${qualifiedColumn}`)) return true;
  }
  return false;
}
