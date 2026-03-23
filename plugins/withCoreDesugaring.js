const { withAppBuildGradle } = require('expo/config-plugins');

function withDesugaring(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    // Add compileOptions with coreLibraryDesugaringEnabled
    if (!contents.includes('coreLibraryDesugaringEnabled')) {
      contents = contents.replace(
        /android\s*\{/,
        `android {
    compileOptions {
        coreLibraryDesugaringEnabled true
    }`
      );
    }

    // Add desugar_jdk_libs dependency
    if (!contents.includes('desugar_jdk_libs')) {
      contents = contents.replace(
        /dependencies\s*\{/,
        `dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")`
      );
    }

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = function withCoreDesugaring(config) {
  return withDesugaring(config);
};
