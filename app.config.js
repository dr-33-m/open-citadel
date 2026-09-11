const appJson = require("./app.json");

const baseConfig = appJson.expo;

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
