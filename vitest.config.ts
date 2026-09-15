import { fileURLToPath } from 'node:url';

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
  /*
   * The same `@/*` alias `tsconfig.json` defines.
   *
   * Vitest resolves imports itself and knows nothing about tsconfig paths, so
   * a module was only testable while it happened to import nothing through the
   * alias — which held until `services/huggingface.ts` needed a shared helper
   * and its suite stopped resolving. Declaring it here means what can be tested
   * no longer depends on how a module happens to import.
   */
  resolve: {
    alias: {
      '@/assets': fileURLToPath(new URL('./assets', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, '**/dist/**'],
  },
});
