CREATE TABLE `vets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`clinic` text,
	`phone` text,
	`email` text,
	`address` text,
	`website` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `entries` ADD `vet_id` integer REFERENCES `vets`(`id`) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `lab_reports` ADD `vet_id` integer REFERENCES `vets`(`id`) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `pets` ADD `vet_id` integer REFERENCES `vets`(`id`) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `vaccinations` ADD `vet_id` integer REFERENCES `vets`(`id`) ON DELETE set null;--> statement-breakpoint
-- The clinic and vet typed on visits and vaccinations become vets: one per
-- distinct pair, whatever its letter case, named after the clinic alone when
-- no vet was typed. 0011 drops the text once every record is linked.
INSERT INTO `vets` (`name`, `clinic`, `created_at`, `updated_at`)
SELECT min(`name`), min(`clinic`), unixepoch() * 1000, unixepoch() * 1000 FROM (
	SELECT coalesce(`vet`, `clinic`) AS `name`, CASE WHEN `vet` IS NOT NULL THEN `clinic` END AS `clinic`
	FROM `entries` WHERE `vet` IS NOT NULL OR `clinic` IS NOT NULL
	UNION ALL
	SELECT `clinic`, NULL FROM `vaccinations` WHERE `clinic` IS NOT NULL
)
GROUP BY lower(`name`), lower(coalesce(`clinic`, ''));
--> statement-breakpoint
UPDATE `entries` SET `vet_id` = (
	SELECT `id` FROM `vets`
	WHERE lower(`vets`.`name`) = lower(coalesce(`entries`.`vet`, `entries`.`clinic`))
		AND lower(coalesce(`vets`.`clinic`, '')) = lower(CASE WHEN `entries`.`vet` IS NOT NULL THEN coalesce(`entries`.`clinic`, '') ELSE '' END)
) WHERE `vet` IS NOT NULL OR `clinic` IS NOT NULL;
--> statement-breakpoint
UPDATE `vaccinations` SET `vet_id` = (
	SELECT `id` FROM `vets` WHERE lower(`vets`.`name`) = lower(`vaccinations`.`clinic`) AND `vets`.`clinic` IS NULL
) WHERE `clinic` IS NOT NULL;
