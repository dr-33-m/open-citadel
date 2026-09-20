import { getAccountToken } from '@/services/account';
import { guestToken } from '@/services/guest-identity';

/**
 * Who Samwell Cloud is talking to.
 *
 * Five places used to write `{ 'x-samwell-device-id': await getCloudDeviceId() }`
 * by hand — the chat turn, the title suggester, the tag suggester, the goal
 * takeaway and the usage read. That was five copies of one DECISION, which is
 * the kind this codebase has already watched drift, and it was about to change
 * in all five at once. It lives here now and they call it.
 *
 * ## The two identities, and why the old one is not one of them
 *
 * There used to be a device id: a random string minted on first launch and
 * kept in `app_settings`. It identified a phone, not a person, so a reinstall
 * was a fresh quota and a second device was a second quota. That is gone, and
 * what replaced it is not the same thing coming back.
 *
 * An ACCOUNT is the identity whenever there is one. A GUEST identity exists
 * only on a device that bought a plan without making an account, is minted at
 * the moment of purchase rather than at launch, and receives no free credits
 * at all - so there is still nothing to farm by reinstalling. See
 * `services/guest-identity`.
 */
export class NotSignedIn extends Error {
  constructor() {
    super('Sign in to use Grand Maester Samwell.');
    this.name = 'NotSignedIn';
  }
}

/**
 * The headers every Samwell Cloud request carries, or a throw.
 *
 * Throwing rather than returning something empty is deliberate: there is no
 * useful anonymous request to make, and a caller that forgot to check would
 * otherwise send one and read a 401 back as a server fault.
 *
 * Two different throws, because they want opposite things said. `NotSignedIn`
 * is nobody signed in, and the answer is to sign in. `AccountTokenUnavailable`
 * comes back up from the SDK when there IS a session that Logto will not mint
 * a Samwell Cloud token for, which is a setup fault and not something signing
 * in again will fix. Both carry their own copy.
 *
 * The token is asked for per request rather than cached here. The SDK holds
 * it, knows when it has expired and refreshes it, and a copy kept in this
 * module would be a second answer to the same question.
 */
export async function cloudHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const token = await getAccountToken();
  if (token) return { Authorization: `Bearer ${token}`, ...extra };

  /*
   * No account, but possibly a device that bought a plan on its own.
   *
   * Second rather than first: an account is the better identity when there is
   * one, and a device that has since signed in must be billed as the person,
   * not as the phone. Reading it here rather than at every call site is the
   * same argument the rest of this file makes - five places deciding what
   * "who is this" means is five places for it to drift.
   */
  const guest = await guestToken();
  if (guest) return { Authorization: `Bearer ${guest}`, ...extra };

  throw new NotSignedIn();
}

/** The same headers, plus the JSON content type every POST here sends. */
export function cloudJsonHeaders(): Promise<Record<string, string>> {
  return cloudHeaders({ 'Content-Type': 'application/json' });
}
