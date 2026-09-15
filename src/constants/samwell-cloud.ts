import Constants from 'expo-constants';

type SamwellCloudExtra = {
  samwellCloudUrl?: string;
};

type ExpoConstantsWithManifests = typeof Constants & {
  manifest?: {
    extra?: SamwellCloudExtra;
  };
  manifest2?: {
    extra?: {
      expoClient?: {
        extra?: SamwellCloudExtra;
      };
    };
  };
};

// Internal app-managed Samwell Cloud endpoint.
// Set SAMWELL_CLOUD_URL when starting Expo or creating an EAS build.
const constants = Constants as ExpoConstantsWithManifests;
const extra =
  (constants.expoConfig?.extra as SamwellCloudExtra | undefined) ??
  constants.manifest2?.extra?.expoClient?.extra ??
  constants.manifest?.extra;

export const SAMWELL_CLOUD_BASE_URL = (extra?.samwellCloudUrl ?? '')
  .trim()
  .replace(/\/+$/, '');

if (__DEV__) {
  console.log(
    `[Samwell Cloud] Resolved base URL: ${SAMWELL_CLOUD_BASE_URL || '(not configured)'}`,
  );
}
