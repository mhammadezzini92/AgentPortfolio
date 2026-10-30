CREATE TABLE `llm_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`operation` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`source_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `knowledge_sources`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "llm_usage_operation_check" CHECK("llm_usage"."operation" IN ('extraction', 'answer'))
);
--> statement-breakpoint
CREATE INDEX `llm_usage_created_at_idx` ON `llm_usage` (`created_at`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
DROP INDEX `knowledge_sources_source_url_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_sources_source_url_unique` ON `knowledge_sources` (`source_url`);--> statement-breakpoint
ALTER TABLE `source_relationships` ADD `evidence` text;