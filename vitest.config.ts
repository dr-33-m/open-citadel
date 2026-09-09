import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Test the source, never the build output.
 *
 * `server/dist` is compiled JavaScript, gitignored, and left behind by any
 * `pnpm server:build`. Vitest was discovering the compiled copies alongside
 * the TypeScript they came from, so every server test ran twice and the stale
 * copy could fail on a change the source had already absorbed - which is
 * exactly what it did the day the default model moved.
 *
 * Spread onto the defaults rather than replacing them: `exclude` is an
 * override, not an addition, so writing out two patterns here would quietly
 * drop the half-dozen vitest ships with.
 */
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/dist/**'],
  },
});
