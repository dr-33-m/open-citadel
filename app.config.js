const fs = require("fs");
const path = require("path");

const appJson = require("./app.json");

const baseConfig = appJson.expo;

/**
 * What changed, for the update dialog: the short lines in release-notes.json.
 *
 * They ride in `extra`, which an over-the-air update carries in its own
 * manifest, so the app can read a new update's notes before it restarts into
 * it. Read with `fs`, not `require`: the fingerprint hashes every module this
 * file loads, and notes that moved the runtime version would cut an update
 * off from the very builds it is for. `extra` itself is left out of the
 * fingerprint in fingerprint.config.js for the same reason.
 */
function readReleaseNotes() {
  try {
    // Beside app.json, found without `__dirname` (this file is linted as app
    // code, which has none).
    const root = path.dirname(require.resolve("./app.json"));
    const file = path.join(root, "release-notes.json");
    const { notes } = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(notes) ? notes : [];
  } catch {
    return [];
  }
}

function getVariantConfig() {
  switch (process.env.APP_VARIANT) {
    case "development":
      return {
        nameSuffix: " Dev",
        packageSuffix: ".dev",
        schemeSuffix: "-dev",
      };
    case "preview":
      return {
        nameSuffix: " Preview",
        packageSuffix: ".preview",
        schemeSuffix: "-preview",
      };
    default:
      return {
        nameSuffix: "",
        packageSuffix: "",
        schemeSuffix: "",
      };
  }
}

module.exports = () => {
  const variant = getVariantConfig();
  const samwellCloudUrl =
    process.env.SAMWELL_CLOUD_URL || baseConfig.extra?.samwellCloudUrl || "";

  // Logto, for the optional account. Neither of these is a secret — a native
  // app is a public OIDC client and both values end up in the bundle either
  // way — they are read from the environment so a build can be made without
  // an account at all, which is what leaving them unset means.
  const logtoEndpoint =
    process.env.LOGTO_ENDPOINT || baseConfig.extra?.logtoEndpoint || "";
  const logtoAppId =
    process.env.LOGTO_APP_ID || baseConfig.extra?.logtoAppId || "";

  // RevenueCat, for the subscription. Public SDK keys, not secrets - they ship
  // inside the binary either way, exactly like the Logto app id above. The
  // test key is for the Test Store, which serves real purchase flows without
  // App Store Connect or Play Console being set up; set it in a development
  // or preview build and it wins over the platform key.
  const revenueCatIosKey =
    process.env.REVENUECAT_IOS_KEY || baseConfig.extra?.revenueCatIosKey || "";
  const revenueCatAndroidKey =
    process.env.REVENUECAT_ANDROID_KEY ||
    baseConfig.extra?.revenueCatAndroidKey ||
    "";
  const mayUseRevenueCatTestStore =
    process.env.APP_VARIANT === "development" ||
    process.env.APP_VARIANT === "preview";
  const revenueCatTestKey = mayUseRevenueCatTestStore
    ? process.env.REVENUECAT_TEST_KEY ||
      baseConfig.extra?.revenueCatTestKey ||
      ""
    : "";

  return {
    ...baseConfig,
    name: `${baseConfig.name}${variant.nameSuffix}`,
    scheme: `${baseConfig.scheme}${variant.schemeSuffix}`,
    extra: {
      ...baseConfig.extra,
      samwellCloudUrl,
      logtoEndpoint,
      logtoAppId,
      revenueCatIosKey,
      revenueCatAndroidKey,
      revenueCatTestKey,
      releaseNotes: readReleaseNotes(),
      // Which build this is, so EAS Observe can keep a development phone's
      // numbers apart from the store's (`lib/observe`).
      appVariant: process.env.APP_VARIANT || "production",
    },
    ios: {
      ...baseConfig.ios,
      bundleIdentifier: `${baseConfig.ios.bundleIdentifier}${variant.packageSuffix}`,
    },
    android: {
      ...baseConfig.android,
      package: `${baseConfig.android.package}${variant.packageSuffix}`,
    },
  };
};
