import { requireOptionalNativeModule } from 'expo';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

type ApplicationModule = { nativeBuildVersion?: string | null; applicationId?: string | null };

/**
 * `expo-application`'s native half, read directly. Every build carries it
 * (`expo-notifications` depends on it, and the hoisted install autolinks it),
 * but it is not a dependency of the app's own, so its JavaScript is not
 * imported. `expo-constants` used to say the build as well and no longer
 * does. Absent, a request says no build and is served as before.
 */
const application = requireOptionalNativeModule<ApplicationModule>('ExpoApplication');

/** This build's application id (Android package, iOS bundle id), if known. */
export const APPLICATION_ID = application?.applicationId ?? null;

/**
 * Which copy of the app this is, sent with every request to Samwell Cloud so
 * the server can tell a copy it no longer serves (see `server/src/app-gate`).
 *
 * The build is the store build (Android versionCode, iOS build number). The
 * release is when the running JavaScript was published, embedded or over the
 * air, which is what a restart onto a newer update changes.
 */
function identityHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'X-App-Platform': Platform.OS };
  const build = application?.nativeBuildVersion;
  if (build) headers['X-App-Build'] = String(build);
  const releasedAt = Updates.createdAt;
  if (releasedAt) headers['X-App-Released-At'] = releasedAt.toISOString();
  return headers;
}

/** Worked out once: none of it changes while the app runs. */
export const APP_IDENTITY_HEADERS: Readonly<Record<string, string>> = identityHeaders();

/** One line naming this copy, to tell a remembered verdict from a stale one. */
export const APP_IDENTITY = Object.values(APP_IDENTITY_HEADERS).join('|');
