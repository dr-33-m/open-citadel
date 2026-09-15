// Learn more https://docs.expo.io/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const projectRoot = __dirname;

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Monorepo support: the app lives at the repo root while shared workspace
// packages (e.g. `samwell-shared`) live under `packages/`. Watch that folder so
// Metro picks up edits, and resolve modules from both the package-local and root
// node_modules (pnpm hoisted linker symlinks workspace packages into the root).
config.watchFolders = [path.resolve(projectRoot, 'packages')];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

// PanelUI/Uniwind's Tailwind-in-RN styling engine. Citadel Frame only ever
// runs the two default themes (their tokens are overridden for our palette
// and square-corner identity in src/theme.css) — the Moon/Grass families
// PanelUI also ships are never registered since nothing selects them.
module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
});
