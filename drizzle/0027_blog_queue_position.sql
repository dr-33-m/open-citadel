ALTER TABLE `blog_articles` ADD `queue_position` integer;--> statement-breakpoint
UPDATE `blog_articles` SET `queue_position` = (SELECT count(*) FROM `blog_articles` AS `earlier` WHERE `earlier`.`saved_at` IS NOT NULL AND (`earlier`.`saved_at` < `blog_articles`.`saved_at` OR (`earlier`.`saved_at` = `blog_articles`.`saved_at` AND `earlier`.`id` < `blog_articles`.`id`))) WHERE `saved_at` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `blog_articles_queue_idx` ON `blog_articles` (`queue_position`);
