export default `CREATE TABLE \`journey_notes\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`kind\` text NOT NULL,
	\`text\` text NOT NULL,
	\`tags\` text,
	\`source_ref\` text,
	\`created_at\` text NOT NULL
);`;
