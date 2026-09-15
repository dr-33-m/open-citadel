export default `ALTER TABLE \`highlights\` ADD \`created_day\` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE \`thoughts\` ADD \`created_day\` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE \`highlights\`
SET \`created_day\` = date(\`created_at\`, 'localtime')
WHERE \`created_day\` = '';
--> statement-breakpoint
UPDATE \`thoughts\`
SET \`created_day\` = date(\`created_at\`, 'localtime')
WHERE \`created_day\` = '';
--> statement-breakpoint
CREATE INDEX \`highlights_created_day_idx\` ON \`highlights\` (\`created_day\`);
--> statement-breakpoint
CREATE INDEX \`thoughts_created_day_idx\` ON \`thoughts\` (\`created_day\`);
`;
