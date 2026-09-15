import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose';
import { type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { SAMWELL_API_RESOURCE } from 'samwell-shared';

/**
 * Who a request belongs to.
 *
 * Samwell Cloud used to tell callers apart with `x-samwell-device-id`, a
 * random string the app minted on first launch. It identified a phone rather
 * than a person, so a reinstall was a fresh allowance and a second device was
 * a second one. Every route now wants an account instead, and there is no
 * anonymous path left: a request with nobody behind it has nobody to meter.
 *
 * The token is a Logto access token issued FOR this API, which is what makes
 * it a JWT this server can check by itself rather than an opaque string only
 * Logto can read. Verification is signature, issuer, audience and expiry —
 * all four, because any one of them alone is a hole.
 */

const endpoint = (process.env.LOGTO_ENDPOINT ?? '').trim().replace(/\/+$/, '');

/**
 * Logto's public keys, fetched once and cached by `jose` from then on.
 *
 * Built lazily rather than at module load so a server started without
 * `LOGTO_ENDPOINT` fails on the first protected request with a clear message,
 * instead of throwing during import and taking the health check down with it.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function keys() {
  if (!endpoint) {
    throw new HTTPException(500, {
      message: 'LOGTO_ENDPOINT is not configured on the server.',
    });
  }
  jwks ??= createRemoteJWKSet(new URL(`${endpoint}/oidc/jwks`));
  return jwks;
}

export type Identity = {
  /**
   * What usage is counted against.
   *
   * Logto's subject claim, prefixed. The prefix is not decoration: this value
   * goes in the same column that used to hold device ids, and `account:` is
   * what stops an old row and a new one ever colliding.
   */
  id: string;
  /** The bare subject, for anything that wants to talk to Logto about them. */
  sub: string;
};

/**
 * The account behind this request, or a 401.
 *
 * Deliberately strict about a token that is present but does not verify. The
 * tempting alternative — fall back to anonymous — would hand every expired
 * session a brand new allowance, which is the one thing metering must not do.
 */
export async function readIdentity(c: Context): Promise<Identity> {
  const header = c.req.header('authorization')?.trim() ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    throw new HTTPException(401, {
      message: 'Sign in to use Grand Maester Samwell.',
    });
  }

  try {
    const { payload } = await jwtVerify(token, keys(), {
      issuer: `${endpoint}/oidc`,
      audience: SAMWELL_API_RESOURCE,
    });
    if (!payload.sub) {
      throw new HTTPException(401, { message: 'That sign-in carries no account.' });
    }
    return { id: `account:${payload.sub}`, sub: payload.sub };
  } catch (error) {
    // A 500 from `keys()` is a server misconfiguration and must not be
    // reported to the app as "your sign-in expired".
    if (error instanceof HTTPException) throw error;
    if (error instanceof joseErrors.JWTExpired) {
      throw new HTTPException(401, { message: 'Your sign-in has expired. Sign in again.' });
    }
    throw new HTTPException(401, { message: 'That sign-in could not be verified.' });
  }
}
