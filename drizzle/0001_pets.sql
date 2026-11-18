CREATE TABLE `chip_registries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`website` text,
	`phone` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chip_registries_name_unique` ON `chip_registries` (`name`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sha256` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`original_name` text NOT NULL,
	`uploaded_by` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_sha256_unique` ON `files` (`sha256`);--> statement-breakpoint
CREATE TABLE `pets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`species` text NOT NULL,
	`breed` text,
	`sex` text NOT NULL,
	`reproductive` text NOT NULL,
	`dob` text,
	`dob_estimated` integer NOT NULL,
	`coat_color` text,
	`eye_color` text,
	`chart_color` text NOT NULL,
	`microchip` text,
	`chip_registry_id` integer,
	`photo_file_id` integer,
	`notes` text,
	`deceased_on` text,
	`created_by` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`chip_registry_id`) REFERENCES `chip_registries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`photo_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
