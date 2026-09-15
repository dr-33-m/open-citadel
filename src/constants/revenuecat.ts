import { Platform } from 'react-native';
import Constants from 'expo-constants';

type RevenueCatExtra = {
  revenueCatIosKey?: string;
  revenueCatAndroidKey?: string;
  revenueCatTestKey?: string;
};

type ExpoConstantsWithManifests = typeof Constants & {
  manifest?: { extra?: RevenueCatExtra };
  manifest2?: { extra?: { expoClient?: { extra?: RevenueCatExtra } } };
};

// The same three-way read as `constants/logto` and `constants/samwell-cloud`:
// `expoConfig` in a dev build, `manifest2` in a published update, `manifest` in
// an older runtime.
const constants = Constants as ExpoConstantsWithManifests;
const extra =
  (constants.expoConfig?.extra as RevenueCatExtra | undefined) ??
  constants.manifest2?.extra?.expoClient?.extra ??
  constants.manifest?.extra;

const iosKey = (extra?.revenueCatIosKey ?? '').trim();
const androidKey = (extra?.revenueCatAndroidKey ?? '').trim();

/**
 * The Test Store key, and why it is worth a slot of its own.
 *
 * RevenueCat's Test Store serves real offerings and real purchase flows
 * without App Store Connect or Play Console being set up at all. That is the
 * only way to exercise buying a plan before the stores are ready, and the
 * stores need a published closed track (Play) and an app version carrying the
 * first IAP (Apple) before they will serve anything.
 *
 * Set only in a development or preview build. It wins over the platform key
 * when present, so switching a build between the Test Store and a real
 * sandbox is one environment variable and no code.
 */
const testKey = (extra?.revenueCatTestKey ?? '').trim();

/**
 * The key this build talks to RevenueCat with.
 *
 * Public SDK keys, not secrets: they ship inside the binary either way, which
 * is the same reason the Logto pair is read from the environment rather than
 * hidden. What they are kept out of git for is that this repo is public.
 */
export const REVENUECAT_API_KEY =
  testKey || (Platform.OS === 'ios' ? iosKey : androidKey);

/** Whether this build talks to the Test Store rather than a real one. */
export const REVENUECAT_TEST_STORE = testKey.length > 0;

/**
 * Whether this build can sell anything.
 *
 * A build made without a key is not broken, it simply has no plans to offer -
 * exactly as `ACCOUNT_ENABLED` handles a build made without Logto. Cloud
 * Samwell says so plainly rather than showing a carousel that cannot be
 * bought from.
 */
export const PURCHASES_ENABLED = REVENUECAT_API_KEY.length > 0;

/**
 * The offering the plan carousel reads.
 *
 * `default` is what `is_current` points at in the RevenueCat dashboard, and
 * asking for it by name rather than taking `offerings.current` means a
 * targeting rule or an experiment cannot silently swap what the app shows
 * without somebody choosing that.
 */
export const REVENUECAT_OFFERING = 'default';

if (__DEV__) {
  console.log(
    `[Purchases] ${
      PURCHASES_ENABLED
        ? `${REVENUECAT_TEST_STORE ? 'Test Store' : Platform.OS} key configured`
        : '(not configured)'
    }`,
  );
}
