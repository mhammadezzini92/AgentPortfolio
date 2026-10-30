-- External-content FTS5 index over knowledge_chunks. Drizzle can't model virtual tables,
-- so this lives in a custom migration that the journal runs after 0000_init.
-- The triggers must pass the exact old values on delete, otherwise the index drifts.
CREATE VIRTUAL TABLE `knowledge_chunks_fts` USING fts5(
	content,
	heading,
	content='knowledge_chunks',
	content_rowid='id',
	tokenize='porter unicode61'
);
--> statement-breakpoint
CREATE TRIGGER `knowledge_chunks_fts_after_insert` AFTER INSERT ON `knowledge_chunks` BEGIN
	INSERT INTO knowledge_chunks_fts(rowid, content, heading) VALUES (new.id, new.content, new.heading);
END;
--> statement-breakpoint
CREATE TRIGGER `knowledge_chunks_fts_after_delete` AFTER DELETE ON `knowledge_chunks` BEGIN
	INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, content, heading) VALUES ('delete', old.id, old.content, old.heading);
END;
--> statement-breakpoint
CREATE TRIGGER `knowledge_chunks_fts_after_update` AFTER UPDATE OF content, heading ON `knowledge_chunks` BEGIN
	INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, content, heading) VALUES ('delete', old.id, old.content, old.heading);
	INSERT INTO knowledge_chunks_fts(rowid, content, heading) VALUES (new.id, new.content, new.heading);
END;
--> statement-breakpoint
INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts) VALUES ('rebuild');
