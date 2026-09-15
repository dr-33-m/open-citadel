# Lessons

## Drizzle migrations in this repo are hand-written — do NOT trust `drizzle-kit generate`
- `drizzle/meta/` snapshots stop at 0004; migrations 0005–0009 were written by hand, so drizzle-kit diffs against a stale snapshot and emits CREATE TABLE for tables that already exist on devices (would brick existing installs).
- Metro has no `.sql` sourceExt: every migration needs a paired `NNNN_name.js` exporting the SQL as a template string (backticks escaped, statements separated by `--> statement-breakpoint`), imported from `drizzle/migrations.js`, plus a `drizzle/meta/_journal.json` entry.
- Pattern: write `NNNN_name.sql` + `NNNN_name.js` by hand, append journal entry, add import + `mNNNN` to `migrations.js`. If drizzle-kit was run, `git checkout drizzle/migrations.js drizzle/meta/_journal.json` and delete its generated sql/snapshot.

## pnpm is not on the default PATH
- Use `export PATH="/home/thamsanqaj/.nvm/versions/node/v24.11.1/bin:$PATH"` before pnpm commands (repo pins pnpm@10 via packageManager).
