PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`music_library_path` text,
	CONSTRAINT "settings_single_row" CHECK("__new_settings"."id" = 1)
);
--> statement-breakpoint
INSERT INTO `__new_settings`("id", "music_library_path") SELECT "id", "music_library_path" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;