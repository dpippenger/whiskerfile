CREATE TABLE `appointments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pet_id` integer NOT NULL,
	`date` text NOT NULL,
	`time` text,
	`vet_id` integer,
	`reason` text,
	`notes` text,
	`created_by` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vet_id`) REFERENCES `vets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `appointments_pet` ON `appointments` (`pet_id`);