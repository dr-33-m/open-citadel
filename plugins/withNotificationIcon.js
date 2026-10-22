const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

/**
 * Copies the status bar icon into the Android project's resources.
 *
 * The media notification's small icon is named to the player by resource
 * (`ic_stat_open_citadel`, see `services/audio-session`), so it has to exist
 * as a drawable in the app itself. The `android/` folder is generated, so the
 * files are kept in `assets/icons/notification/`, one per density, and copied
 * in on every prebuild.
 *
 * They are the app icon's monochrome mark in white on nothing: Android draws
 * a status bar icon from its alpha alone. `drawable/` holds the vector marks
 * the media notification's own buttons use (Highlight, for a book, named in
 * the `@rntp/player` patch), copied in the same way.
 */
const SOURCE = path.join('assets', 'icons', 'notification');

module.exports = function withNotificationIcon(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const from = path.join(config.modRequest.projectRoot, SOURCE);
      const res = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      for (const density of fs.readdirSync(from)) {
        const target = path.join(res, density);
        fs.mkdirSync(target, { recursive: true });
        for (const file of fs.readdirSync(path.join(from, density))) {
          fs.copyFileSync(path.join(from, density, file), path.join(target, file));
        }
      }
      return config;
    },
  ]);
};
