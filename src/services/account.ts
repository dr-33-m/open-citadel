/**
 * The account, and the only file that talks to Logto.
 *
 * ## Why there is no `LogtoProvider`
 *
 * The documented Expo setup wraps the app in a context whose value flips twice
 * during boot — once when the stored session is read, once when the client
 * reports itself initialised. At the root that is two re-renders of the whole
 * tree for a fact that two cards in Settings care about. `LogtoProvider` is a
 * thin wrapper around `LogtoClient` and nothing else, so the client lives here
 * as a service and its state lives in `stores/account`, which is how every
 * other piece of state in this app is arranged.
 *
 * ## Where the truth is
 *
 * The store is for drawing. Anything making a REQUEST asks this module for a
 * token instead, because the store hydrates asynchronously at launch and a
 * request that read it too early would go out unauthenticated. The client
 * reads its own storage on every call and is always right.
 */
import {
  LogtoClient,
  LogtoNativeClientError,
  Prompt,
  UserScope,
  type LogtoNativeConfig,
} from '@logto/rn';
import { SAMWELL_API_RESOURCE } from 'samwell-shared';

import {
  ACCOUNT_ENABLED,
  ACCOUNT_REDIRECT_URI,
  LOGTO_APP_ID,
  LOGTO_ENDPOINT,
} from '@/constants/logto';

/** Which screen the hosted flow opens on. The flow itself is the same one. */
export type AccountEntry = 'sign_in' | 'register';

export type AccountProfile = {
  /** Logto's subject claim. The account's identity everywhere else. */
  sub: string;
  email: string | null;
  name: string | null;
};

/**
 * Thrown for the one failure that is not a failure: the reader opened the
 * browser and closed it again. Callers show nothing for this.
 */
export class AccountCancelled extends Error {
  constructor() {
    super('Sign-in was cancelled.');
    this.name = 'AccountCancelled';
  }
}

const config: LogtoNativeConfig = {
  endpoint: LOGTO_ENDPOINT,
  appId: LOGTO_APP_ID,
  // Email is what the account is identified by in the UI, so it has to be
  // asked for; without this scope the ID token carries a subject and nothing
  // a person would recognise.
  scopes: [UserScope.Email, UserScope.Profile],
  // Asking for a token FOR Samwell Cloud is what makes Logto issue a JWT the
  // server can verify by itself. Without a resource the token is opaque and
  // only Logto can say who it belongs to.
  resources: [SAMWELL_API_RESOURCE],
  /*
   * Ask for the password every time, rather than taking the browser's word.
   *
   * The SDK's own default is `Prompt.Consent` — its type says otherwise, but
   * the constructor reads `{ prompt: [Prompt.Consent], ...config }` and
   * Logto's sample app overrides it for the same reason. Consent alone reuses
   * a live Logto session, and on Android the sign-in runs in a Chrome Custom
   * Tab that shares Chrome's cookies, so the session outlives a sign-out that
   * only clears this app's tokens.
   *
   * The result without this: SIGN OUT, then SIGN IN, and you are instantly
   * back in the same account having been asked nothing — which reads as sign
   * out being broken, and leaves no way to sign in as anybody else.
   */
  prompt: Prompt.Login,
};

let client: LogtoClient | null = null;

/**
 * The client, or null in a build with no Logto configured.
 *
 * Lazy because constructing it touches the secure store, and a build without
 * an account should never pay for one. Every caller here handles the null.
 */
function getClient(): LogtoClient | null {
  if (!ACCOUNT_ENABLED) return null;
  client ??= new LogtoClient(config);
  return client;
}

/** Turns a closed browser into `AccountCancelled` and rethrows anything else. */
function rethrow(error: unknown): never {
  if (error instanceof LogtoNativeClientError && error.code === 'auth_session_failed') {
    throw new AccountCancelled();
  }
  throw error;
}

/**
 * Opens Logto's hosted flow and returns once the browser has come back.
 *
 * `entry` only chooses the first screen. Someone who opened "create account"
 * can still sign in from there, and the other way round, which is why this is
 * one function and not two.
 */
export async function signIn(entry: AccountEntry): Promise<AccountProfile | null> {
  const logto = getClient();
  if (!logto) return null;

  try {
    await logto.signIn({ redirectUri: ACCOUNT_REDIRECT_URI, firstScreen: entry });
  } catch (error) {
    rethrow(error);
  }

  return readProfile();
}

/**
 * Drops the session.
 *
 * Local only, by the SDK's own default: it revokes the tokens and clears
 * storage without opening a browser. Nothing on this device is deleted — the
 * books, highlights and notes are all local and have nothing to do with the
 * account.
 */
export async function signOut(): Promise<void> {
  const logto = getClient();
  if (!logto) return;
  await logto.signOut();
}

/** Who is signed in, read from the stored ID token. No network. */
export async function readProfile(): Promise<AccountProfile | null> {
  const logto = getClient();
  if (!logto) return null;
  if (!(await logto.isAuthenticated())) return null;

  const claims = await logto.getIdTokenClaims();
  return {
    sub: claims.sub,
    email: claims.email ?? null,
    name: claims.name ?? null,
  };
}

/**
 * Thrown when there IS a session but no token can be got for Samwell Cloud.
 *
 * Kept apart from "nobody is signed in" because the two look identical from
 * the outside and want opposite things said about them. The usual cause is
 * setup rather than the reader: the API resource named by
 * `SAMWELL_API_RESOURCE` has to exist in the Logto console for Logto to issue
 * a token with that audience, and it is the one step of the setup with no
 * other symptom. Collapsing it into `null` produced the worst possible
 * report — an account card showing your email beside a Samwell insisting you
 * sign in, with nothing to try.
 */
export class AccountTokenUnavailable extends Error {
  constructor(readonly cause: unknown) {
    super('Your account could not be verified for Samwell Cloud.');
    this.name = 'AccountTokenUnavailable';
  }
}

/**
 * A token for Samwell Cloud. Null means nobody is signed in.
 *
 * The SDK refreshes an expired one, so this is the call every request makes
 * rather than something cached anywhere: a copy kept here would be a second
 * answer to a question the SDK already owns.
 */
export async function getAccountToken(): Promise<string | null> {
  const logto = getClient();
  if (!logto) return null;
  if (!(await logto.isAuthenticated())) return null;

  try {
    return await logto.getAccessToken(SAMWELL_API_RESOURCE);
  } catch (error) {
    if (__DEV__) {
      console.warn(
        `[Account] Signed in, but no access token for ${SAMWELL_API_RESOURCE}. ` +
          'Is that API resource registered in Logto?',
        error,
      );
    }
    throw new AccountTokenUnavailable(error);
  }
}
