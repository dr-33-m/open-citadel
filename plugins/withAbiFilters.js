const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withAbiFilters(config, abis = ['arm64-v8a', 'x86_64']) {
  return withAppBuildGradle(config, (config) => {
    const abiList = abis.map((a) => `"${a}"`).join(', ');
    const snippet = `        ndk {\n            abiFilters ${abiList}\n        }`;

    if (config.modResults.contents.includes('abiFilters')) {
      // Already patched — replace existing abiFilters line
      config.modResults.contents = config.modResults.contents.replace(
        /ndk\s*\{[^}]*abiFilters[^}]*\}/,
        snippet,
      );
    } else {
      // Inject inside defaultConfig { ... }
      config.modResults.contents = config.modResults.contents.replace(
        /(defaultConfig\s*\{)/,
        `$1\n${snippet}`,
      );
    }

    return config;
  });
};
