import "server-only";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import {
  PROVENANCES,
  SOURCE_TYPES,
  chatQuestions,
  entitySuppressions,
  experiences,
  ingestionJobs,
  knowledgeChunks,
  knowledgeSources,
  llmUsage,
  profile,
  projects,
  rateLimits,
  sourceRelationships,
} from "@/models/schemas";

// "list" is one item per line, "json" a JSON document, "projectRef" a project picker.
export type FieldKind = "text" | "longtext" | "enum" | "list" | "json" | "partialDate" | "projectRef";

export type FieldSpec = {
  key: string;
  label: string;
  kind: FieldKind;
  options?: readonly string[];
  hint?: string;
  // Starting value on the create form, for fields whose empty value isn't "".
  defaultValue?: unknown;
};

export type ListColumn = { key: string; label: string };

export type DataTableSpec = {
  name: string;
  label: string;
  description: string;
  table: SQLiteTable;
  orderBy: SQLiteColumn;
  listColumns: ListColumn[];
  searchColumns: SQLiteColumn[];
  // Null means read-only: the table is an audit trail or owned by the pipeline.
  editFields: FieldSpec[] | null;
  canCreate: boolean;
  canDelete: boolean;
  editNote?: string;
  // For read-only tables whose rows may still be removed from the list view.
  rowDelete?: { label: string; confirmText: string };
};

const REPROCESS_NOTE = "Hand-edited rows are kept as you wrote them: reprocessing only fills fields you left empty, and deleting a source never removes them.";

const TABLE_SPECS: DataTableSpec[] = [
  {
    name: "profile",
    label: "Profile",
    description: "The single owner profile the agent introduces.",
    table: profile,
    orderBy: profile.id,
    listColumns: [
      { key: "fullName", label: "Name" },
      { key: "title", label: "Title" },
      { key: "location", label: "Location" },
      { key: "skills", label: "Skills" },
      { key: "manuallyEditedAt", label: "Edited" },
    ],
    searchColumns: [profile.fullName],
    editFields: [
      { key: "fullName", label: "Full name", kind: "text" },
      { key: "title", label: "Title", kind: "text" },
      { key: "location", label: "Location", kind: "text" },
      { key: "professionalSummary", label: "Professional summary", kind: "longtext" },
      { key: "skills", label: "Skills", kind: "list", defaultValue: [] },
      { key: "languages", label: "Languages", kind: "json", defaultValue: [], hint: '[{ "name": "English", "proficiency": "Native" }]' },
      { key: "education", label: "Education", kind: "json", defaultValue: [], hint: '[{ "institution": "…", "degree": "…", "field": "…", "startDate": "2015", "endDate": "2019" }]' },
      { key: "contactInformation", label: "Contact", kind: "json", defaultValue: {}, hint: '{ "email": "…", "website": "https://…", "linkedin": "https://…", "github": "https://…" }' },
    ],
    canCreate: true,
    canDelete: false,
    editNote: REPROCESS_NOTE,
  },
  {
    name: "projects",
    label: "Projects",
    description: "Projects merged from all sources.",
    table: projects,
    orderBy: projects.id,
    listColumns: [
      { key: "id", label: "ID" },
      { key: "name", label: "Name" },
      { key: "role", label: "Role" },
      { key: "technologies", label: "Technologies" },
      { key: "manuallyEditedAt", label: "Edited" },
    ],
    searchColumns: [projects.name, projects.description],
    editFields: [
      { key: "name", label: "Name", kind: "text", hint: "Extraction matches projects by name, so a rename makes later sources create a new row." },
      { key: "description", label: "Description", kind: "longtext" },
      { key: "role", label: "Role", kind: "text" },
      { key: "architecture", label: "Architecture", kind: "longtext" },
      { key: "technologies", label: "Technologies", kind: "list", defaultValue: [] },
      { key: "challenges", label: "Challenges", kind: "longtext" },
      { key: "solutions", label: "Solutions", kind: "longtext" },
      { key: "achievements", label: "Achievements", kind: "longtext" },
    ],
    canCreate: true,
    canDelete: true,
    editNote: REPROCESS_NOTE,
  },
  {
    name: "experiences",
    label: "Experience",
    description: "Roles merged from all sources.",
    table: experiences,
    orderBy: experiences.id,
    listColumns: [
      { key: "id", label: "ID" },
      { key: "company", label: "Company" },
      { key: "position", label: "Position" },
      { key: "startDate", label: "Start" },
      { key: "endDate", label: "End" },
      { key: "manuallyEditedAt", label: "Edited" },
    ],
    searchColumns: [experiences.company, experiences.position],
    editFields: [
      { key: "company", label: "Company", kind: "text", hint: "Matched with position on later extractions; renaming makes later sources create a new row." },
      { key: "position", label: "Position", kind: "text" },
      { key: "startDate", label: "Start date", kind: "partialDate" },
      { key: "endDate", label: "End date", kind: "partialDate", hint: "Leave empty for a current role." },
      { key: "description", label: "Description", kind: "longtext" },
      { key: "responsibilities", label: "Responsibilities", kind: "list", defaultValue: [] },
      { key: "technologies", label: "Technologies", kind: "list", defaultValue: [] },
    ],
    canCreate: true,
    canDelete: true,
    editNote: REPROCESS_NOTE,
  },
  {
    name: "knowledge_chunks",
    label: "Chunks",
    description: "Searchable text passages the chat retrieves from.",
    table: knowledgeChunks,
    orderBy: knowledgeChunks.id,
    listColumns: [
      { key: "id", label: "ID" },
      { key: "sourceId", label: "Source" },
      { key: "heading", label: "Heading" },
      { key: "provenance", label: "Provenance" },
      { key: "projectId", label: "Project" },
      { key: "content", label: "Content" },
    ],
    searchColumns: [knowledgeChunks.content, knowledgeChunks.heading],
    editFields: [
      { key: "provenance", label: "Provenance", kind: "enum", options: PROVENANCES, hint: "personal = your own work; general = background knowledge; unverified = unclear." },
      { key: "projectId", label: "Project", kind: "projectRef" },
      { key: "heading", label: "Heading", kind: "text" },
      { key: "content", label: "Content", kind: "longtext" },
    ],
    canCreate: false,
    canDelete: false,
    editNote: "Reprocessing the source rebuilds its chunks, which replaces these edits. Fix lasting facts in Profile, Projects or Experience instead.",
  },
  {
    name: "knowledge_sources",
    label: "Sources",
    description: "Imported documents and URLs. Status and hashes belong to the pipeline.",
    table: knowledgeSources,
    orderBy: knowledgeSources.id,
    listColumns: [
      { key: "id", label: "ID" },
      { key: "title", label: "Title" },
      { key: "sourceType", label: "Type" },
      { key: "status", label: "Status" },
      { key: "sourceUrl", label: "URL" },
      { key: "lastFetchedAt", label: "Fetched" },
    ],
    searchColumns: [knowledgeSources.title, knowledgeSources.sourceUrl],
    editFields: [
      { key: "title", label: "Title", kind: "text" },
      { key: "sourceType", label: "Type", kind: "enum", options: SOURCE_TYPES, hint: "Sets the default provenance and whether facts are extracted; takes effect on the next forced reprocess." },
    ],
    canCreate: false,
    canDelete: false,
  },
  {
    name: "source_relationships",
    label: "Source links",
    description: "Which source supports which fact, with the evidence quote.",
    table: sourceRelationships,
    orderBy: sourceRelationships.id,
    listColumns: [
      { key: "id", label: "ID" },
      { key: "sourceId", label: "Source" },
      { key: "entityType", label: "Entity" },
      { key: "entityId", label: "Entity ID" },
      { key: "evidence", label: "Evidence" },
    ],
    searchColumns: [sourceRelationships.evidence],
    editFields: null,
    canCreate: false,
    canDelete: false,
  },
  {
    name: "ingestion_jobs",
    label: "Jobs",
    description: "Every ingestion run and how it ended.",
    table: ingestionJobs,
    orderBy: ingestionJobs.id,
    listColumns: [
      { key: "id", label: "ID" },
      { key: "sourceId", label: "Source" },
      { key: "status", label: "Status" },
      { key: "errorMessage", label: "Error" },
      { key: "startedAt", label: "Started" },
      { key: "completedAt", label: "Completed" },
    ],
    searchColumns: [ingestionJobs.errorMessage],
    editFields: null,
    canCreate: false,
    canDelete: false,
  },
  {
    name: "llm_usage",
    label: "LLM usage",
    description: "Every model request with tokens and billed cost.",
    table: llmUsage,
    orderBy: llmUsage.id,
    listColumns: [
      { key: "id", label: "ID" },
      { key: "operation", label: "Operation" },
      { key: "model", label: "Model" },
      { key: "inputTokens", label: "In" },
      { key: "outputTokens", label: "Out" },
      { key: "costUsd", label: "Cost (USD)" },
      { key: "sourceId", label: "Source" },
      { key: "createdAt", label: "At" },
    ],
    searchColumns: [llmUsage.model],
    editFields: null,
    canCreate: false,
    canDelete: false,
  },
  {
    name: "entity_suppressions",
    label: "Suppressed",
    description: "Projects and roles you deleted. Reprocessing won't re-create them; remove a row to allow it again.",
    table: entitySuppressions,
    orderBy: entitySuppressions.id,
    listColumns: [
      { key: "entityType", label: "Type" },
      { key: "label", label: "Deleted entry" },
      { key: "createdAt", label: "Deleted at" },
    ],
    searchColumns: [entitySuppressions.label],
    editFields: null,
    canCreate: false,
    canDelete: true,
    rowDelete: {
      label: "Allow again",
      confirmText: "Allow this entry again? The next reprocess of a source that mentions it will re-create it.",
    },
  },
  {
    name: "chat_questions",
    label: "Chat questions",
    description: "Visitor questions from the last 30 days, without IPs.",
    table: chatQuestions,
    orderBy: chatQuestions.id,
    listColumns: [
      { key: "id", label: "ID" },
      { key: "question", label: "Question" },
      { key: "outcome", label: "Outcome" },
      { key: "retrievedChunkCount", label: "Chunks" },
      { key: "latencyMs", label: "Latency (ms)" },
      { key: "createdAt", label: "At" },
    ],
    searchColumns: [chatQuestions.question],
    editFields: null,
    canCreate: false,
    canDelete: false,
  },
  {
    name: "rate_limits",
    label: "Rate limits",
    description: "Current request-count windows per client and action.",
    table: rateLimits,
    orderBy: rateLimits.windowStart,
    listColumns: [
      { key: "key", label: "Key" },
      { key: "windowStart", label: "Window start (unix)" },
      { key: "count", label: "Count" },
    ],
    searchColumns: [rateLimits.key],
    editFields: null,
    canCreate: false,
    canDelete: false,
  },
];

export function listTableSpecs(): DataTableSpec[] {
  return TABLE_SPECS;
}

export function findTableSpec(name: string): DataTableSpec | undefined {
  return TABLE_SPECS.find((spec) => spec.name === name);
}
