import { getAccountToken } from '@/services/account';

/**
 * Who Samwell Cloud is talking to.
 *
 * Five places used to write `{ 'x-samwell-device-id': await getCloudDeviceId() }`
 * by hand — the chat turn, the title suggester, the tag suggester, the goal
 * takeaway and the usage read. That was five copies of one DECISION, which is
 * the kind this codebase has already watched drift, and it was about to change
 * in all five at once. It lives here now and they call it.
 *
 * ## Why there is no device id any more
 *
 * There used to be one: a random string minted on first launch and kept in
 * `app_settings`. It identified a phone, not a person, so a reinstall was a
 * fresh quota and a second device was a second quota. Samwell Cloud now runs
 * on accounts, so a request without one has nobody to bill and is not sent.
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
 * The token is asked for per request rather than cached here. The SDK holds
 * it, knows when it has expired and refreshes it, and a copy kept in this
 * module would be a second answer to the same question.
 */
export async function cloudHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const token = await getAccountToken();
  if (!token) throw new NotSignedIn();
  return { Authorization: `Bearer ${token}`, ...extra };
}

/** The same headers, plus the JSON content type every POST here sends. */
export function cloudJsonHeaders(): Promise<Record<string, string>> {
  return cloudHeaders({ 'Content-Type': 'application/json' });
}
