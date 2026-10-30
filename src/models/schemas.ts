import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type {
  ContactInformation,
  Education,
  Language,
} from "@/utils/validation";

export const SOURCE_TYPES = [
  "cv",
  "portfolio",
  "github",
  "article",
  "documentation",
  "upload",
] as const;
export const PROCESSING_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
] as const;
export const PROVENANCES = ["personal", "general", "unverified"] as const;
export const ENTITY_TYPES = ["profile", "project", "experience"] as const;
export const LLM_OPERATIONS = ["extraction", "answer"] as const;

// Drizzle's SQLite enums are TypeScript-only; this makes the database reject unknown values too.
// Values are compile-time constants, so inlining them as literals is safe.
const isOneOf = (column: AnySQLiteColumn, values: readonly string[]) =>
  sql`${column} IN (${sql.raw(values.map((value) => `'${value}'`).join(", "))})`;

export type SourceType = (typeof SOURCE_TYPES)[number];
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];
export type Provenance = (typeof PROVENANCES)[number];
export type EntityType = (typeof ENTITY_TYPES)[number];
export type LlmOperation = (typeof LLM_OPERATIONS)[number];

// Stored as unix seconds; Drizzle maps them to Date in app code.
const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

// SQLite has no ON UPDATE, so Drizzle sets this on every update query it builds.
// Raw SQL updates must set it themselves.
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`)
    .$onUpdate(() => new Date());

export const profile = sqliteTable(
  "profile",
  {
    id: integer("id").primaryKey().default(1),
    fullName: text("full_name").notNull(),
    title: text("title"),
    professionalSummary: text("professional_summary"),
    location: text("location"),
    skills: text("skills", { mode: "json" }).$type<string[]>().notNull().default([]),
    languages: text("languages", { mode: "json" }).$type<Language[]>().notNull().default([]),
    education: text("education", { mode: "json" }).$type<Education[]>().notNull().default([]),
    contactInformation: text("contact_information", { mode: "json" })
      .$type<ContactInformation>()
      .notNull()
      .default({}),
    updatedAt: updatedAt(),
  },
  (table) => [check("profile_single_row", sql`${table.id} = 1`)],
);

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  role: text("role"),
  architecture: text("architecture"),
  technologies: text("technologies", { mode: "json" }).$type<string[]>().notNull().default([]),
  challenges: text("challenges"),
  solutions: text("solutions"),
  achievements: text("achievements"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const experiences = sqliteTable("experiences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  company: text("company").notNull(),
  position: text("position").notNull(),
  description: text("description"),
  responsibilities: text("responsibilities", { mode: "json" }).$type<string[]>().notNull().default([]),
  technologies: text("technologies", { mode: "json" }).$type<string[]>().notNull().default([]),
  // CVs rarely give day precision, so dates are "YYYY" or "YYYY-MM". A null end_date means current.
  startDate: text("start_date"),
  endDate: text("end_date"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const knowledgeSources = sqliteTable(
  "knowledge_sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceType: text("source_type", { enum: SOURCE_TYPES }).notNull(),
    sourceUrl: text("source_url"),
    title: text("title"),
    // Null until the first fetch. SQLite allows many NULLs under a unique index.
    contentHash: text("content_hash"),
    storagePath: text("storage_path"),
    status: text("status", { enum: PROCESSING_STATUSES }).notNull().default("pending"),
    lastFetchedAt: integer("last_fetched_at", { mode: "timestamp" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("knowledge_sources_content_hash_unique").on(table.contentHash),
    check("knowledge_sources_source_type_check", isOneOf(table.sourceType, SOURCE_TYPES)),
    check("knowledge_sources_status_check", isOneOf(table.status, PROCESSING_STATUSES)),
    uniqueIndex("knowledge_sources_source_url_unique").on(table.sourceUrl),
  ],
);

export const knowledgeChunks = sqliteTable(
  "knowledge_chunks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
    content: text("content").notNull(),
    heading: text("heading"),
    chunkIndex: integer("chunk_index").notNull(),
    provenance: text("provenance", { enum: PROVENANCES }).notNull(),
    contentHash: text("content_hash").notNull(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index("knowledge_chunks_source_id_idx").on(table.sourceId),
    index("knowledge_chunks_project_id_idx").on(table.projectId),
    uniqueIndex("knowledge_chunks_source_chunk_unique").on(table.sourceId, table.chunkIndex),
    check("knowledge_chunks_provenance_check", isOneOf(table.provenance, PROVENANCES)),
  ],
);

export const sourceRelationships = sqliteTable(
  "source_relationships",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    entityType: text("entity_type", { enum: ENTITY_TYPES }).notNull(),
    entityId: integer("entity_id").notNull(),
    // Verbatim quote from the source backing this entity, kept for traceability.
    evidence: text("evidence"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("source_relationships_unique").on(table.sourceId, table.entityType, table.entityId),
    index("source_relationships_entity_idx").on(table.entityType, table.entityId),
    check("source_relationships_entity_type_check", isOneOf(table.entityType, ENTITY_TYPES)),
  ],
);

export const ingestionJobs = sqliteTable(
  "ingestion_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    status: text("status", { enum: PROCESSING_STATUSES }).notNull().default("pending"),
    errorMessage: text("error_message"),
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    createdAt: createdAt(),
  },
  (table) => [
    index("ingestion_jobs_source_id_idx").on(table.sourceId),
    check("ingestion_jobs_status_check", isOneOf(table.status, PROCESSING_STATUSES)),
  ],
);

// cost_usd is what OpenRouter billed for the request, so no local price table is needed.
// Null when the provider didn't report it; the dashboard falls back to token counts.
export const llmUsage = sqliteTable(
  "llm_usage",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    operation: text("operation", { enum: LLM_OPERATIONS }).notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costUsd: real("cost_usd"),
    sourceId: integer("source_id").references(() => knowledgeSources.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [
    index("llm_usage_created_at_idx").on(table.createdAt),
    check("llm_usage_operation_check", isOneOf(table.operation, LLM_OPERATIONS)),
  ],
);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull(),
});

export type Profile = typeof profile.$inferSelect;
export type NewProfile = typeof profile.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Experience = typeof experiences.$inferSelect;
export type NewExperience = typeof experiences.$inferInsert;
export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type NewKnowledgeSource = typeof knowledgeSources.$inferInsert;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
export type NewKnowledgeChunk = typeof knowledgeChunks.$inferInsert;
export type SourceRelationship = typeof sourceRelationships.$inferSelect;
export type NewSourceRelationship = typeof sourceRelationships.$inferInsert;
export type IngestionJob = typeof ingestionJobs.$inferSelect;
export type NewIngestionJob = typeof ingestionJobs.$inferInsert;
export type LlmUsage = typeof llmUsage.$inferSelect;
export type NewLlmUsage = typeof llmUsage.$inferInsert;
