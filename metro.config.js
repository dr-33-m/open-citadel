// Learn more https://docs.expo.io/guides/customizing-metro
const fs = require('fs');
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

// Agent worktrees live under .claude/worktrees, each with its own node_modules.
// Metro would watch all of them and run the system out of inotify watches
// (ENOSPC), so keep them out of the file map.
const defaultBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(defaultBlockList) ? defaultBlockList : [defaultBlockList]).filter(Boolean),
  /[/\\]\.claude[/\\].*/,
];

// A fix to react-native-screen-transitions that cannot live in `patches/`.
// `patches/` is a fingerprint input, so patching the library would change the
// runtime version and an over-the-air update carrying the fix could never
// reach the build it is for. Instead, the library's import of its
// `ActivityScreen` resolves to a guarded copy in `vendor-fixes/`, and that
// copy's relative imports resolve from the original's folder, so it shares
// every store and context with the library. The why is in the copy.
const realPath = (file) => {
  try {
    return fs.realpathSync(file);
  } catch {
    return file;
  }
};
const ACTIVITY_SCREEN = realPath(
  path.resolve(projectRoot, 'node_modules/react-native-screen-transitions/src/components/activity/variants/activity-screen.tsx'),
);
const ACTIVITY_SCREEN_FIX = path.resolve(projectRoot, 'vendor-fixes/react-native-screen-transitions/activity-screen.tsx');
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolveRequest ?? context.resolveRequest;
  if (moduleName.startsWith('.') && realPath(context.originModulePath) === ACTIVITY_SCREEN_FIX) {
    return resolve({ ...context, originModulePath: ACTIVITY_SCREEN }, moduleName, platform);
  }
  const resolution = resolve(context, moduleName, platform);
  if (
    moduleName.endsWith('activity-screen') &&
    resolution.type === 'sourceFile' &&
    realPath(resolution.filePath) === ACTIVITY_SCREEN
  ) {
    return { type: 'sourceFile', filePath: ACTIVITY_SCREEN_FIX };
  }
  return resolution;
};

// PanelUI/Uniwind's Tailwind-in-RN styling engine. Citadel Frame only ever
// runs the two default themes (their tokens are overridden for our palette
// and square-corner identity in src/theme.css) — the Moon/Grass families
// PanelUI also ships are never registered since nothing selects them.
module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
});
