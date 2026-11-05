CREATE TABLE `download_items` (
	`id` integer PRIMARY KEY NOT NULL,
	`job_id` integer NOT NULL,
	`position` integer NOT NULL,
	`source_id` text NOT NULL,
	`url` text,
	`thumbnail_url` text,
	`title` text NOT NULL,
	`tags` text NOT NULL,
	`path_without_extension` text NOT NULL,
	`state` text NOT NULL,
	`error_reason` text,
	`log` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `download_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `download_items_job_position` ON `download_items` (`job_id`,`position`);--> statement-breakpoint
CREATE TABLE `download_jobs` (
	`id` integer PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`state` text NOT NULL,
	`error_reason` text,
	`created_at_ms` integer NOT NULL,
	`started_at_ms` integer,
	`finished_at_ms` integer,
	`item_count` integer NOT NULL,
	`completed_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `download_jobs_state` ON `download_jobs` (`state`,`created_at_ms`);