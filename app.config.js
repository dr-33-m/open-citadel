const appJson = require('./app.json');

const baseConfig = appJson.expo;

function getVariantConfig() {
  switch (process.env.APP_VARIANT) {
    case 'development':
      return {
        nameSuffix: ' Dev',
        packageSuffix: '.dev',
        schemeSuffix: '-dev',
      };
    case 'preview':
      return {
        nameSuffix: ' Preview',
        packageSuffix: '.preview',
        schemeSuffix: '-preview',
      };
    default:
      return {
        nameSuffix: '',
        packageSuffix: '',
        schemeSuffix: '',
      };
  }
}

module.exports = () => {
  const variant = getVariantConfig();
  const samwellCloudUrl =
    process.env.SAMWELL_CLOUD_URL || baseConfig.extra?.samwellCloudUrl || '';

  return {
    ...baseConfig,
    name: `${baseConfig.name}${variant.nameSuffix}`,
    scheme: `${baseConfig.scheme}${variant.schemeSuffix}`,
    extra: {
      ...baseConfig.extra,
      samwellCloudUrl,
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
