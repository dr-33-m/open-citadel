const { withPodfile } = require("expo/config-plugins");

// react-native-readium v5 needs three Podfile changes that prebuild doesn't
// generate (see the package README "iOS" section):
//   1. The Readium spec repo `source` (pods aren't on the CocoaPods CDN)
//   2. `readium_pods` inside the target (transitive pods needing modular headers)
//   3. `readium_post_install` in post_install (Minizip modulemap workarounds)
const READIUM_SCRIPTS_REQUIRE =
  'readium_scripts_dir = File.join(File.dirname(`node --print "require.resolve(\'@dr33m/react-native-readium/package.json\')"`), \'scripts\')\n' +
  "load File.join(readium_scripts_dir, 'readium_pods.rb')\n" +
  "load File.join(readium_scripts_dir, 'readium_post_install.rb')\n";

const SOURCES =
  "source 'https://github.com/readium/podspecs'\n" +
  "source 'https://cdn.cocoapods.org/'\n";

module.exports = function withReadiumPodfile(config) {
  return withPodfile(config, (config) => {
    let contents = config.modResults.contents;

    if (!contents.includes("readium/podspecs")) {
      contents = SOURCES + "\n" + contents;
    }

    if (!contents.includes("readium_pods.rb")) {
      contents = contents.replace(
        /^prepare_react_native_project!$/m,
        READIUM_SCRIPTS_REQUIRE + "\nprepare_react_native_project!",
      );
    }

    if (!/^\s*readium_pods\s*$/m.test(contents)) {
      contents = contents.replace(
        /^(\s*)use_expo_modules!$/m,
        "$1use_expo_modules!\n$1readium_pods",
      );
    }

    if (!contents.includes("readium_post_install(installer)")) {
      contents = contents.replace(
        /^(\s*)post_install do \|installer\|$/m,
        "$1post_install do |installer|\n$1  readium_post_install(installer)",
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};
