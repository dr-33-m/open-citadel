const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withGradleVersion(config, gradleVersion = '8.13') {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const propsPath = path.join(
        config.modRequest.platformProjectRoot,
        'gradle',
        'wrapper',
        'gradle-wrapper.properties'
      );

      let contents = fs.readFileSync(propsPath, 'utf8');
      contents = contents.replace(
        /distributionUrl=.*$/m,
        `distributionUrl=https\\://services.gradle.org/distributions/gradle-${gradleVersion}-bin.zip`
      );
      fs.writeFileSync(propsPath, contents);

      return config;
    },
  ]);
};
