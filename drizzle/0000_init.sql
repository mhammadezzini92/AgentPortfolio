CREATE TABLE `experiences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company` text NOT NULL,
	`position` text NOT NULL,
	`description` text,
	`responsibilities` text DEFAULT '[]' NOT NULL,
	`technologies` text DEFAULT '[]' NOT NULL,
	`start_date` text,
	`end_date` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ingestion_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `knowledge_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ingestion_jobs_status_check" CHECK("ingestion_jobs"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `ingestion_jobs_source_id_idx` ON `ingestion_jobs` (`source_id`);--> statement-breakpoint
CREATE TABLE `knowledge_chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`project_id` integer,
	`content` text NOT NULL,
	`heading` text,
	`chunk_index` integer NOT NULL,
	`provenance` text NOT NULL,
	`content_hash` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `knowledge_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "knowledge_chunks_provenance_check" CHECK("knowledge_chunks"."provenance" IN ('personal', 'general', 'unverified'))
);
--> statement-breakpoint
CREATE INDEX `knowledge_chunks_source_id_idx` ON `knowledge_chunks` (`source_id`);--> statement-breakpoint
CREATE INDEX `knowledge_chunks_project_id_idx` ON `knowledge_chunks` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_chunks_source_chunk_unique` ON `knowledge_chunks` (`source_id`,`chunk_index`);--> statement-breakpoint
CREATE TABLE `knowledge_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_type` text NOT NULL,
	`source_url` text,
	`title` text,
	`content_hash` text,
	`storage_path` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_fetched_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "knowledge_sources_source_type_check" CHECK("knowledge_sources"."source_type" IN ('cv', 'portfolio', 'github', 'article', 'documentation', 'upload')),
	CONSTRAINT "knowledge_sources_status_check" CHECK("knowledge_sources"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_sources_content_hash_unique` ON `knowledge_sources` (`content_hash`);--> statement-breakpoint
CREATE INDEX `knowledge_sources_source_url_idx` ON `knowledge_sources` (`source_url`);--> statement-breakpoint
CREATE TABLE `profile` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`full_name` text NOT NULL,
	`title` text,
	`professional_summary` text,
	`location` text,
	`skills` text DEFAULT '[]' NOT NULL,
	`languages` text DEFAULT '[]' NOT NULL,
	`education` text DEFAULT '[]' NOT NULL,
	`contact_information` text DEFAULT '{}' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "profile_single_row" CHECK("profile"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`role` text,
	`architecture` text,
	`technologies` text DEFAULT '[]' NOT NULL,
	`challenges` text,
	`solutions` text,
	`achievements` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_relationships` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `knowledge_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "source_relationships_entity_type_check" CHECK("source_relationships"."entity_type" IN ('profile', 'project', 'experience'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_relationships_unique` ON `source_relationships` (`source_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `source_relationships_entity_idx` ON `source_relationships` (`entity_type`,`entity_id`);