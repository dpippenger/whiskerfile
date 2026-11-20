DROP INDEX `files_sha256_unique`;--> statement-breakpoint
CREATE INDEX `files_sha256` ON `files` (`sha256`);