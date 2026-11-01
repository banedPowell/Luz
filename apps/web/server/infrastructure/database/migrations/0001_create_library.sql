CREATE TABLE `albums` (
	`id` integer PRIMARY KEY NOT NULL,
	`artist_id` integer NOT NULL,
	`key` text NOT NULL,
	`title` text,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `albums_artist_key` ON `albums` (`artist_id`,`key`);--> statement-breakpoint
CREATE TABLE `artists` (
	`id` integer PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artists_key_unique` ON `artists` (`key`);--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` integer PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`album_id` integer NOT NULL,
	`title` text,
	`artists` text,
	`track_number` integer,
	`disc_number` integer,
	`year` integer,
	`genre` text,
	`duration_ms` integer,
	`file_size` integer NOT NULL,
	`modified_at_ms` integer NOT NULL,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_path_unique` ON `tracks` (`path`);--> statement-breakpoint
CREATE INDEX `tracks_album_id` ON `tracks` (`album_id`);