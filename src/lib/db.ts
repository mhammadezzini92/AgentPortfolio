import "server-only";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/models/schemas";
import { databaseEnv } from "@/lib/env";

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = databaseEnv();

const client = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });

export const db = drizzle(client, { schema });

export type Database = typeof db;
