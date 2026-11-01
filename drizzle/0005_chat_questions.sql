CREATE TABLE `chat_questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`question` text NOT NULL,
	`retrieved_chunk_count` integer NOT NULL,
	`outcome` text NOT NULL,
	`llm_usage_id` integer,
	`latency_ms` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`llm_usage_id`) REFERENCES `llm_usage`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chat_questions_outcome_check" CHECK("chat_questions"."outcome" IN ('answered', 'no_context', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `chat_questions_created_at_idx` ON `chat_questions` (`created_at`);