ALTER TABLE `compass_milestones` ADD `last_reported_date` text;--> statement-breakpoint
UPDATE `compass_milestones` SET `last_reported_date` = (
	SELECT MAX(`local_date`) FROM `compass_checkins`
	WHERE `compass_checkins`.`milestone_id` = `compass_milestones`.`id`
	AND `compass_checkins`.`kind` = 'night'
);