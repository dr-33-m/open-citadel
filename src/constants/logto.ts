import Constants from 'expo-constants';

type LogtoExtra = {
  logtoEndpoint?: string;
  logtoAppId?: string;
};

type ExpoConstantsWithManifests = typeof Constants & {
  manifest?: { extra?: LogtoExtra };
  manifest2?: { extra?: { expoClient?: { extra?: LogtoExtra } } };
};

// The same three-way read as `constants/samwell-cloud`: `expoConfig` in a dev
// build, `manifest2` in a published update, `manifest` in an older runtime.
const constants = Constants as ExpoConstantsWithManifests;
const extra =
  (constants.expoConfig?.extra as LogtoExtra | undefined) ??
  constants.manifest2?.extra?.expoClient?.extra ??
  constants.manifest?.extra;

export const LOGTO_ENDPOINT = (extra?.logtoEndpoint ?? '').trim().replace(/\/+$/, '');
export const LOGTO_APP_ID = (extra?.logtoAppId ?? '').trim();

/**
 * Whether this build has an account at all.
 *
 * A build made without the two Logto values is not broken, it simply has no
 * accounts: the Profile shows no account card and the Samwell Cloud panel says
 * so plainly. Everything local keeps working.
 */
export const ACCOUNT_ENABLED = LOGTO_ENDPOINT.length > 0 && LOGTO_APP_ID.length > 0;

/**
 * Where Logto sends the browser back to when sign-in finishes.
 *
 * Built from the resolved scheme by hand rather than with
 * `Linking.createURL('callback')`, which returns a triple-slash form
 * (`opencitadel:///callback`) and an `exp://...` URL under Expo Go. This value
 * has to match the redirect URI registered in the Logto Console character for
 * character or the sign-in ends on an error page, so it is worth being able to
 * read it off the page and know what it will be.
 *
 * Each build variant has its own scheme (`opencitadel`, `opencitadel-dev`,
 * `opencitadel-preview`, see `app.config.js`), so all three need registering.
 */
const scheme = constants.expoConfig?.scheme;
export const ACCOUNT_REDIRECT_URI = `${(Array.isArray(scheme) ? scheme[0] : scheme) ?? 'opencitadel'}://callback`;

if (__DEV__) {
  console.log(
    `[Account] Logto ${ACCOUNT_ENABLED ? LOGTO_ENDPOINT : '(not configured)'}, redirect ${ACCOUNT_REDIRECT_URI}`,
  );
}
