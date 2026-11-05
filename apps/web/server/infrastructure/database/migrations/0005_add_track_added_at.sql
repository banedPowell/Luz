ALTER TABLE `tracks` ADD `added_at_ms` integer;--> statement-breakpoint
-- Tracks indexed before the column existed: when they were added is unknown, and the
-- modification time of their file is the best estimate of it
UPDATE `tracks` SET `added_at_ms` = `modified_at_ms` WHERE `added_at_ms` IS NULL;
