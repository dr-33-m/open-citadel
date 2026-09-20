import { SAMWELL_CLOUD_BASE_URL } from '@/constants/samwell-cloud';
import { getAccountToken } from '@/services/account';
import { GuestLinked, guestToken } from '@/services/guest-identity';

/**
 * Moving a plan off a phone and onto an account.
 *
 * A device can buy without registering, so a plan can exist with nobody's
 * name on it. Registering later is how it stops being tied to one phone, and
 * this is the request that does it: the server re-keys the credit row from
 * `guest:<uuid>` to `account:<sub>` and remembers the pair forever, so a
 * renewal arriving eighteen months later still lands on the right reader.
 *
 * Both identities are proved in the one request and neither is taken on the
 * other's word. The account by its Logto token, the device by its guest
 * token. This is the request that decides who owns a subscription for the
 * rest of its life, so it is the one place that must not infer either half.
 */
export type LinkOutcome =
  /** The plan is on the account now. */
  | 'linked'
  /** Nothing to do: no account, or this device never bought anything. */
  | 'nothing'
  /**
   * It was already done, and this attempt only found out. The first one's
   * answer never arrived, so the device still holds a credential for a plan
   * that has moved on. Nothing to move, something to let go of.
   */
  | 'alreadyLinked'
  /**
   * The account already holds a plan of its own. Refused rather than merged:
   * nobody asked us to do arithmetic on two balances, and somebody has
   * probably just paid twice by accident. Nothing is taken from either side.
   */
  | 'accountHasPlan';

/** Matching every other call here. Hermes has no `AbortSignal.timeout`. */
const REQUEST_TIMEOUT_MS = 15_000;

export async function linkGuestToAccount(): Promise<LinkOutcome> {
  const base = SAMWELL_CLOUD_BASE_URL.trim().replace(/\/+$/, '');
  if (!base) return 'nothing';

  /*
   * The account token first, and read directly rather than through
   * `cloudHeaders`. That helper falls back to the guest token when there is
   * no account, which is right everywhere else and would be exactly wrong
   * here: it would send this device's own token as both halves and ask the
   * server to link a guest to itself.
   */
  const account = await getAccountToken();
  if (!account) return 'nothing';

  /*
   * The server refuses to mint for a guest that has been linked, so this is
   * where a repeat attempt finds out that the last one worked. Without it the
   * device retries a request it can never complete on every launch, and never
   * lets go of a credential for a plan it no longer holds.
   */
  let guest: string | null;
  try {
    guest = await guestToken();
  } catch (error) {
    if (error instanceof GuestLinked) return 'alreadyLinked';
    throw error;
  }
  if (!guest) return 'nothing';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${base}/account/link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account}`,
        'X-Guest-Authorization': `Bearer ${guest}`,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 409) return 'accountHasPlan';
  if (!response.ok) throw new Error(`Linking refused (${response.status}).`);
  return 'linked';
}
