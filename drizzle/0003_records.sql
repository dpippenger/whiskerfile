CREATE TABLE `entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pet_id` integer NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`clinic` text,
	`vet` text,
	`reason` text,
	`notes` text,
	`created_by` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `entries_pet_date` ON `entries` (`pet_id`,`date`);--> statement-breakpoint
CREATE TABLE `measurements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pet_id` integer NOT NULL,
	`entry_id` integer,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`value` real NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `measurements_pet_kind_date` ON `measurements` (`pet_id`,`kind`,`date`);--> statement-breakpoint
CREATE INDEX `measurements_entry` ON `measurements` (`entry_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `weight_unit` text;--> statement-breakpoint
ALTER TABLE `users` ADD `temperature_unit` text;