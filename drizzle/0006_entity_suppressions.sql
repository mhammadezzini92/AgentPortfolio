CREATE TABLE `entity_suppressions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`match_key` text NOT NULL,
	`label` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "entity_suppressions_entity_type_check" CHECK("entity_suppressions"."entity_type" IN ('project', 'experience'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entity_suppressions_unique` ON `entity_suppressions` (`entity_type`,`match_key`);