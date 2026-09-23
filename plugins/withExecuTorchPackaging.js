const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Keeps ExecuTorch's unused native libraries out of the APK.
 *
 * react-native-executorch packages everything in its prebuilt
 * `third-party/android/libs/executorch/<abi>/` folder, not only what it links.
 * Its 0.10.0 core tarball ships the Vulkan backend in that folder whatever
 * `backends` asks for (11.7 MB per ABI), and macOS `._*` resource forks beside
 * every library. Nothing links or loads either when Vulkan is off: CMake only
 * links the backends `backends` enables.
 *
 * Reads the same `react-native-executorch.backends` block the library does, so
 * turning Vulkan on in package.json keeps it packaged.
 */
module.exports = function withExecuTorchPackaging(config) {
  const pkg = require('../package.json');
  const backends = pkg['react-native-executorch']?.backends ?? [];
  const excludes = ["'**/._*'"];
  if (!backends.includes('vulkan')) excludes.push("'**/libvulkan_executorch_backend.so'");

  return withAppBuildGradle(config, (config) => {
    const marker = '// withExecuTorchPackaging';
    if (config.modResults.contents.includes(marker)) return config;

    config.modResults.contents = config.modResults.contents.replace(
      /android\s*\{/,
      `android {
    ${marker}
    packagingOptions {
        jniLibs {
            ${excludes.map((e) => `excludes += ${e}`).join('\n            ')}
        }
    }`,
    );
    return config;
  });
};
