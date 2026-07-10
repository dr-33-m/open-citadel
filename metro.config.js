// Learn more https://docs.expo.io/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Monorepo support: the app lives at the repo root while shared workspace
// packages (e.g. `samwell-shared`) live under `packages/`. Watch that folder so
// Metro picks up edits, and resolve modules from both the package-local and root
// node_modules (pnpm hoisted linker symlinks workspace packages into the root).
config.watchFolders = [path.resolve(projectRoot, 'packages')];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
