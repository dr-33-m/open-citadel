/**
 * Expo's preset, plus one production-only plugin: `transform-remove-console`
 * strips `console.*` calls from release bundles. Every log serializes its
 * arguments and crosses the bridge, so the dozen-plus calls in the services
 * (one per tool call, one per request) are pure JS-thread cost in production
 * and zero value to a user. `error` and `warn` survive — they carry the
 * signal a crash report or a red screen needs. Dev builds are untouched.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    env: {
      production: {
        plugins: [
          [
            'transform-remove-console',
            { exclude: ['error', 'warn'] },
          ],
        ],
      },
    },
  };
};
