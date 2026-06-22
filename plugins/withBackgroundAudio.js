const { withInfoPlist } = require("expo/config-plugins");

module.exports = function withBackgroundAudio(config) {
  return withInfoPlist(config, (config) => {
    const modes = config.modResults.UIBackgroundModes ?? [];
    if (!modes.includes("audio")) {
      modes.push("audio");
    }
    config.modResults.UIBackgroundModes = modes;
    return config;
  });
};
