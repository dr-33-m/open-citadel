export default `CREATE TABLE \`compass_goals\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`title\` text NOT NULL,
	\`description\` text,
	\`status\` text DEFAULT 'active' NOT NULL,
	\`created_at\` text NOT NULL,
	\`completed_at\` text
);
--> statement-breakpoint
CREATE TABLE \`compass_milestones\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`goal_id\` text NOT NULL,
	\`title\` text NOT NULL,
	\`effort_unit_definition\` text NOT NULL,
	\`status\` text DEFAULT 'active' NOT NULL,
	\`estimated_effort_units\` real NOT NULL,
	\`completed_effort_units\` real DEFAULT 0 NOT NULL,
	\`start_date\` text NOT NULL,
	\`target_date\` text NOT NULL,
	\`current_projected_date\` text,
	\`actual_completed_date\` text,
	\`original_estimate_days\` integer NOT NULL,
	\`final_variance_days\` integer,
	\`sort_order\` integer DEFAULT 0 NOT NULL,
	\`created_at\` text NOT NULL,
	FOREIGN KEY (\`goal_id\`) REFERENCES \`compass_goals\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE \`compass_checkins\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`goal_id\` text NOT NULL,
	\`milestone_id\` text NOT NULL,
	\`local_date\` text NOT NULL,
	\`kind\` text NOT NULL,
	\`raw_text\` text NOT NULL,
	\`mission_summary\` text,
	\`focus_score\` integer,
	\`effort_units_completed\` real,
	\`pit_wall_message\` text NOT NULL,
	\`analysis_json\` text NOT NULL,
	\`created_at\` text NOT NULL,
	\`updated_at\` text NOT NULL,
	FOREIGN KEY (\`goal_id\`) REFERENCES \`compass_goals\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`milestone_id\`) REFERENCES \`compass_milestones\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX \`compass_checkins_day_kind_idx\` ON \`compass_checkins\` (\`goal_id\`,\`local_date\`,\`kind\`);
--> statement-breakpoint
CREATE TABLE \`compass_actions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`checkin_id\` text NOT NULL,
	\`description\` text NOT NULL,
	\`category\` text NOT NULL,
	\`alignment\` text NOT NULL,
	\`minutes\` integer,
	\`effort_units\` real,
	\`planned\` integer DEFAULT 0 NOT NULL,
	\`created_at\` text NOT NULL,
	FOREIGN KEY (\`checkin_id\`) REFERENCES \`compass_checkins\`(\`id\`) ON UPDATE no action ON DELETE cascade
);`;
