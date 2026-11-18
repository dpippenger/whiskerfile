CREATE TABLE `analytes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`default_unit` text,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analytes_code_unique` ON `analytes` (`code`);--> statement-breakpoint
CREATE TABLE `lab_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pet_id` integer NOT NULL,
	`entry_id` integer,
	`date` text NOT NULL,
	`source` text NOT NULL,
	`lab` text,
	`accession` text,
	`notes` text,
	`created_by` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lab_reports_pet_date` ON `lab_reports` (`pet_id`,`date`);--> statement-breakpoint
CREATE TABLE `lab_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_id` integer NOT NULL,
	`analyte_id` integer NOT NULL,
	`value_text` text NOT NULL,
	`value` real,
	`comparator` text,
	`unit` text,
	`ref_low` real,
	`ref_high` real,
	FOREIGN KEY (`report_id`) REFERENCES `lab_reports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`analyte_id`) REFERENCES `analytes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lab_results_report_analyte` ON `lab_results` (`report_id`,`analyte_id`);--> statement-breakpoint
CREATE INDEX `lab_results_analyte` ON `lab_results` (`analyte_id`);--> statement-breakpoint
ALTER TABLE `attachments` ADD `lab_report_id` integer REFERENCES lab_reports(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `attachments_lab_report` ON `attachments` (`lab_report_id`);