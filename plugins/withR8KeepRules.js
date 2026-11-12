const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

/**
 * Keeps R8 away from native code nobody has tested under it.
 *
 * Release builds shrink and rename (`enableMinifyInReleaseBuilds`), which
 * Play asks for. A library that reaches its own classes by name (reflection,
 * JNI, a registry keyed on a class name) has to say so in consumer ProGuard
 * rules, or R8 renames or removes what it looks up and the app breaks at run
 * time, not at build time. Finding those one crash at a time does not scale:
 * the reader crashed on open, then read-aloud found no text.
 *
 * So the default is inverted. Every native package in node_modules that ships
 * no consumer rules of its own is kept whole: not shrunk, not renamed. Only
 * code whose authors vouch for R8 (androidx, Kotlin, OkHttp, Media3, React
 * Native, ExecuTorch, ...) is renamed. That still renames about two thirds
 * of the classes against the quarter Play asks for, and a new dependency is
 * safe the day it is added, with nothing to remember.
 *
 * What this cannot see is listed in MAVEN_KEEPS below: libraries that arrive
 * from Maven rather than node_modules, and one library reaching by name into
 * another. Add to it when a release build shows a ClassNotFound or
 * NoSuchMethod that a debug build does not.
 */

const TAG = 'with-r8-keep-rules';
const BEGIN = `# @generated begin ${TAG}`;
const END = `# @generated end ${TAG}`;

const MAVEN_KEEPS = [
  // Readium ships no rules. It files a book's services under each service
  // class's simple name; renamed, ContentService and ContentProtectionService
  // both became `c`, one replaced the other, and read-aloud found no text.
  '-keep class org.readium.** { *; }',
  // react-native-keyboard-controller looks up handleMotionEvent on React
  // Native's JSPointerDispatcher by name. Renamed, touches inside a
  // KeyboardExtender would go nowhere, silently.
  '-keepclassmembers class com.facebook.react.uimanager.JSPointerDispatcher { public <methods>; }',
];

/**
 * Package folders in node_modules, scoped ones included, and the copies a
 * package keeps in its own node_modules when it needs a different version
 * (expo-updates carries its own expo-eas-client).
 */
function packageDirs(nodeModules, dirs = []) {
  if (!fs.existsSync(nodeModules)) return dirs;
  for (const name of fs.readdirSync(nodeModules)) {
    if (name.startsWith('.')) continue;
    const dir = path.join(nodeModules, name);
    const pkgs = name.startsWith('@') ? fs.readdirSync(dir).map((sub) => path.join(dir, sub)) : [dir];
    for (const pkg of pkgs) {
      dirs.push(pkg);
      packageDirs(path.join(pkg, 'node_modules'), dirs);
    }
  }
  return dirs;
}

function shipsOwnRules(androidDir) {
  const gradle = ['build.gradle', 'build.gradle.kts']
    .map((f) => path.join(androidDir, f))
    .find((f) => fs.existsSync(f));
  if (!gradle) return null; // not a native module
  return /consumerProguardFiles/.test(fs.readFileSync(gradle, 'utf8'));
}

// Folders that hold no code the app ships.
const SKIP_DIRS = /^(node_modules|ios|test|androidTest|__tests__|example|examples|\..*)$/;

/**
 * Java packages declared anywhere in the package, not only android/src: Nitro
 * writes the Kotlin that C++ calls by name to nitrogen/generated/android.
 */
function declaredPackages(dir, found = new Set()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.test(entry.name)) declaredPackages(p, found);
    } else if (/\.(kt|java)$/.test(entry.name)) {
      const match = fs.readFileSync(p, 'utf8').match(/^package\s+([\w.]+)/m);
      // Codegen stubs some libraries declare in React Native's own packages
      // are React Native's to keep, and it does.
      if (match && !match[1].startsWith('com.facebook.')) found.add(match[1]);
    }
  }
  return found;
}

/** Drops any package already covered by a shorter one: a.b covers a.b.c. */
function roots(packages) {
  const sorted = [...packages].sort();
  return sorted.filter((p, i) => !sorted.slice(0, i).some((q) => p.startsWith(`${q}.`)));
}

function keepRules(projectRoot) {
  const unvetted = new Set();
  for (const dir of packageDirs(path.join(projectRoot, 'node_modules'))) {
    const android = path.join(dir, 'android');
    if (shipsOwnRules(android) !== false) continue;
    declaredPackages(dir).forEach((p) => unvetted.add(p));
  }
  const keeps = roots(unvetted).map((p) => `-keep class ${p}.** { *; }`);
  return [BEGIN, '# Native modules that ship no R8 rules, kept whole.', ...keeps, ...MAVEN_KEEPS, END].join('\n');
}

module.exports = function withR8KeepRules(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const file = path.join(config.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      const cleared = current.replace(new RegExp(`\\n?${BEGIN}[\\s\\S]*?${END}\\n?`), '\n');
      fs.writeFileSync(file, `${cleared.trimEnd()}\n\n${keepRules(config.modRequest.projectRoot)}\n`);
      return config;
    },
  ]);
};
