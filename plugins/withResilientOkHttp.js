const fs = require('fs');
const path = require('path');
const { withMainApplication } = require('expo/config-plugins');

/**
 * Makes every HTTP request on Android survive a network that changes under it.
 *
 * Installs `ResilientOkHttpFactory` (kept in `plugins/resilient-okhttp/`, read
 * there for why) as React Native's OkHttp factory before anything makes a
 * request. React Native's networking and expo/fetch both take their clients
 * from it.
 *
 * Expensify's answer to the same problem was to replace the stack with
 * Chrome's (react-native-nitro-fetch on Cronet). This is the smaller step that
 * fixes the part that was hurting: connections that died without saying so.
 */
const TEMPLATE = path.join('plugins', 'resilient-okhttp', 'ResilientOkHttpFactory.kt');
const INSTALL = 'OkHttpClientProvider.setOkHttpClientFactory(ResilientOkHttpFactory(this))';
const IMPORT = 'import com.facebook.react.modules.network.OkHttpClientProvider';

module.exports = function withResilientOkHttp(config) {
  return withMainApplication(config, (config) => {
    const app = config.modResults;
    if (app.language !== 'kt') {
      throw new Error('withResilientOkHttp expects a Kotlin MainApplication.');
    }
    const pkg = app.contents.match(/^package\s+([\w.]+)/m)?.[1];
    if (!pkg) throw new Error('withResilientOkHttp could not read the MainApplication package.');

    // Beside MainApplication, in its package, written fresh on every prebuild.
    const template = fs.readFileSync(path.join(config.modRequest.projectRoot, TEMPLATE), 'utf8');
    const source = template.replace('__PACKAGE__', pkg);
    fs.writeFileSync(path.join(path.dirname(app.path), 'ResilientOkHttpFactory.kt'), source);

    let contents = app.contents;
    if (!contents.includes(IMPORT)) {
      contents = contents.replace(/^(package\s+[\w.]+\s*\n)/m, `$1\n${IMPORT}\n`);
    }
    if (!contents.includes(INSTALL)) {
      // First thing in onCreate: before React Native loads, so no client is
      // ever made the old way.
      contents = contents.replace(/(override fun onCreate\(\)\s*\{\s*\n\s*super\.onCreate\(\)\s*\n)/, `$1    ${INSTALL}\n`);
      if (!contents.includes(INSTALL)) {
        throw new Error('withResilientOkHttp could not find onCreate in MainApplication.');
      }
    }
    app.contents = contents;
    return config;
  });
};
