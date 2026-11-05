ALTER TABLE `download_jobs` ADD `output_format` text DEFAULT 'source' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `output_format` text;