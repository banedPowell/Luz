CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`theme` text NOT NULL,
	`music_library_path` text,
	CONSTRAINT "settings_single_row" CHECK("settings"."id" = 1),
	CONSTRAINT "settings_theme" CHECK("settings"."theme" in ('system', 'light', 'dark'))
);
