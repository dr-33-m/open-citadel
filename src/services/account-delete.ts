import { SAMWELL_CLOUD_BASE_URL } from '@/constants/samwell-cloud';
import { cloudHeaders } from '@/services/cloud-identity';

/**
 * Deleting the cloud account.
 *
 * The app cannot do this by itself. A reader's token is issued for Samwell
 * Cloud, not for Logto's own management API, so the server is the only side
 * that can remove the user behind the account. It also holds the credits, the
 * ledger and the usage rows, and those go in the same request.
 *
 * Nothing local is touched here, and the sheet that calls this says so: the
 * books, the highlights, the notes and the goals are on the phone and have
 * nothing to do with the account.
 */

/** Longer than the usual read: the server calls Logto and RevenueCat inside it. */
const REQUEST_TIMEOUT_MS = 30_000;

export async function deleteCloudAccount(): Promise<void> {
  const baseUrl = SAMWELL_CLOUD_BASE_URL.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('Grand Maester Samwell is not set up in this build.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/account`, {
      method: 'DELETE',
      headers: await cloudHeaders(),
      signal: controller.signal,
    });
  } catch {
    throw new Error('Cannot reach Samwell Cloud. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }

  if (response.ok) return;

  /*
   * The server's own message, when it sent one. Every failure here is either
   * a misconfigured deployment or an outage at Logto, and "try again" is the
   * only honest thing to say about both - but saying it in the server's words
   * keeps one copy of that sentence rather than two.
   */
  const detail = await response.text().catch(() => '');
  console.warn('[Account] Delete failed', response.status, detail.slice(0, 300));
  throw new Error(
    response.status === 401
      ? 'Your sign-in has expired. Sign in again, then delete your account.'
      : 'Your account could not be deleted. Try again.',
  );
}
