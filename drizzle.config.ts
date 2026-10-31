import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

const url = process.env.TURSO_DATABASE_URL;
if (!url) throw new Error("TURSO_DATABASE_URL is not set");

export default defineConfig({
  schema: "./src/models/schemas.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url,
    // A blank "TURSO_AUTH_TOKEN=" line arrives as "", which drizzle-kit rejects; local files need none.
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  },
});
