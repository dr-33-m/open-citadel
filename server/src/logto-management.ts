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
 * A resource indicator names an API rather than pointing at one, and Logto
 * uses two different names for the same API. A Logto Cloud tenant calls it
 * `https://<tenant>.logto.app/api`, which is `LOGTO_ENDPOINT` with `/api` on
 * the end. A self-hosted tenant calls itself the default tenant and keeps
 * that name whatever domain it is served from, so a custom-domain deployment
 * answers `invalid_target` for the address it is actually reached at, which is
 * how this was found.
 *
 * Decided by the host: only `*.logto.app` is Logto Cloud. A tenant that
 * disagrees can say so with `LOGTO_MANAGEMENT_RESOURCE`.
 */
const SELF_HOSTED_RESOURCE = 'https://default.logto.app/api';

function managementResources(): string[] {
  const override = process.env.LOGTO_MANAGEMENT_RESOURCE?.trim();
  if (override) return [override];

  let cloudFirst = false;
  try {
    cloudFirst = new URL(endpoint).hostname.endsWith('.logto.app');
  } catch {
    cloudFirst = false;
  }

  /*
   * Both names, likeliest first. The unlikely one is only ever tried after
   * the tenant has said `invalid_target` about the other, and trying it saves
   * a deploy spent guessing which kind of tenant this is.
   */
  const cloud = `${endpoint}/api`;
  const ordered = cloudFirst ? [cloud, SELF_HOSTED_RESOURCE] : [SELF_HOSTED_RESOURCE, cloud];
  return [...new Set(ordered)];
}

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

  const authorization = `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`;
  const resources = managementResources();

  for (const [index, resource] of resources.entries()) {
    const response = await fetch(`${endpoint}/oidc/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: authorization,
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        resource,
        scope: 'all',
      }).toString(),
    });

    if (response.ok) {
      const body = (await response.json()) as { access_token?: string };
      if (body.access_token) return body.access_token;
      console.error('[Logto] Management token came back without one.');
      break;
    }

    const detail = await response.text().catch(() => '');
    // Only the resource is worth a second attempt. A refused client or a
    // missing management role says the same thing about every resource.
    const unknownResource = detail.includes('invalid_target');
    const lastChance = index === resources.length - 1;
    console.error(
      `[Logto] Management token refused for ${resource} (${response.status}): ${detail}`,
    );
    if (!unknownResource || lastChance) break;
  }

  throw new HTTPException(502, {
    message: 'Your account could not be deleted. Try again.',
  });
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
