/**
 * The Logto Management API, for the one thing the app cannot do itself.
 *
 * Deleting an account means deleting the Logto user, and no token a phone
 * holds can do that: the hosted flow issues tokens for THIS api, not for
 * Logto's own. So the server asks for a second token of its own, as a
 * machine-to-machine application, and calls Logto's management endpoint with
 * it.
 *
 * Set up in the Logto console once: create a machine-to-machine app, give it
 * the Logto Management API role, and put its id and secret in
 * `LOGTO_M2M_APP_ID` and `LOGTO_M2M_APP_SECRET`. Without them account
 * deletion answers 500 rather than half-deleting somebody, since a reader who
 * is told their account is gone must not still be able to sign in.
 */
import { HTTPException } from 'hono/http-exception';

const endpoint = (process.env.LOGTO_ENDPOINT ?? '').trim().replace(/\/+$/, '');

/**
 * The management API's own resource indicator.
 *
 * On Logto Cloud this is the tenant endpoint with `/api` on it, which is what
 * `LOGTO_ENDPOINT` already holds. A self-hosted tenant reached through a
 * custom domain names itself `https://default.logto.app/api` instead - an
 * identifier, not an address - so `LOGTO_MANAGEMENT_RESOURCE` can override it.
 */
const MANAGEMENT_RESOURCE =
  process.env.LOGTO_MANAGEMENT_RESOURCE?.trim() || `${endpoint}/api`;

export function managementConfigured(): boolean {
  return Boolean(
    endpoint && process.env.LOGTO_M2M_APP_ID && process.env.LOGTO_M2M_APP_SECRET,
  );
}

/**
 * A management token, asked for per call.
 *
 * Not cached. Deleting an account happens once per account in the life of a
 * reader, so a cache here would hold a credential for hours to save a request
 * nobody is waiting on twice.
 */
async function managementToken(): Promise<string> {
  const appId = process.env.LOGTO_M2M_APP_ID?.trim() ?? '';
  const appSecret = process.env.LOGTO_M2M_APP_SECRET?.trim() ?? '';
  if (!endpoint || !appId || !appSecret) {
    throw new HTTPException(500, {
      message: 'Account deletion is not configured on the server.',
    });
  }

  const response = await fetch(`${endpoint}/oidc/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      resource: MANAGEMENT_RESOURCE,
      scope: 'all',
    }).toString(),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(`[Logto] Management token refused (${response.status}): ${detail}`);
    throw new HTTPException(502, {
      message: 'Your account could not be deleted. Try again.',
    });
  }

  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new HTTPException(502, {
      message: 'Your account could not be deleted. Try again.',
    });
  }
  return body.access_token;
}

/**
 * Deletes the Logto user behind a subject claim.
 *
 * A 404 counts as done: the user is gone, which is what the caller asked for,
 * and a retry after a half-failed delete must be able to finish rather than
 * report a fault about the part that already worked.
 */
export async function deleteLogtoUser(sub: string): Promise<void> {
  const token = await managementToken();
  const response = await fetch(`${endpoint}/api/users/${encodeURIComponent(sub)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.ok || response.status === 404) return;

  const detail = await response.text().catch(() => '');
  console.error(`[Logto] Deleting user ${sub} failed (${response.status}): ${detail}`);
  throw new HTTPException(502, {
    message: 'Your account could not be deleted. Try again.',
  });
}
