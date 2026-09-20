import { createRemoteJWKSet, decodeJwt, jwtVerify, errors as joseErrors } from 'jose';
import { type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { SAMWELL_API_RESOURCE } from 'samwell-shared';

import {
  GUEST_ISSUER,
  guestAccessConfigured,
  verifyGuestToken,
} from './guest-identity.js';

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
   *
   * For a guest it is `guest:<uuid>` as minted on the device, unprefixed
   * because it already carries one. The two can never collide, and every
   * route downstream treats them the same: an opaque key to meter against.
   */
  id: string;
  /**
   * The bare subject, for anything that wants to talk to Logto about them.
   *
   * For a guest this is the guest id, which is also its RevenueCat
   * `app_user_id`. Check `kind` before handing it to Logto, which has never
   * heard of them.
   */
  sub: string;
  /** Which of the two this is. Most routes do not care. */
  kind: 'account' | 'guest';
};

/**
 * Who this request belongs to, or a 401.
 *
 * Two kinds of bearer token reach this server and they are told apart by
 * issuer, not by guesswork: Logto's own, verified against their JWKS, and the
 * short-lived ones we sign for a device that bought a plan without making an
 * account. The issuer is read from the unverified payload only to choose a
 * verifier - nothing is trusted until one of them has checked the signature,
 * the issuer, the audience and the expiry.
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

  if (looksLikeGuestToken(token)) return readGuestIdentity(token);

  try {
    const { payload } = await jwtVerify(token, keys(), {
      issuer: `${endpoint}/oidc`,
      audience: SAMWELL_API_RESOURCE,
    });
    if (!payload.sub) {
      throw new HTTPException(401, { message: 'That sign-in carries no account.' });
    }
    return { id: `account:${payload.sub}`, sub: payload.sub, kind: 'account' };
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

/**
 * Is this one of ours?
 *
 * Reads the issuer from the payload without verifying anything, purely to
 * choose which verifier runs. A forged issuer gets a forged token sent to the
 * guest verifier, which will reject it for the signature; it cannot be used
 * to skip verification, only to pick the wrong door and be turned away.
 */
function looksLikeGuestToken(token: string): boolean {
  try {
    return decodeJwt(token).iss === GUEST_ISSUER;
  } catch {
    return false;
  }
}

/**
 * The device behind this request.
 *
 * No link check here, deliberately. A token minted just before its guest was
 * linked to an account stays valid for the rest of its hour, and it does not
 * matter: linking moves the credit row to the account, so the guest id is
 * left with nothing to spend and every metered route refuses it on the
 * balance. The alternative is a database read in front of every request to
 * re-answer a question the ledger already answers.
 */
async function readGuestIdentity(token: string): Promise<Identity> {
  if (!guestAccessConfigured()) {
    throw new HTTPException(401, { message: 'That token could not be verified.' });
  }
  try {
    const guestId = await verifyGuestToken(token);
    return { id: guestId, sub: guestId, kind: 'guest' };
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) {
      throw new HTTPException(401, { message: 'That token has expired.' });
    }
    throw new HTTPException(401, { message: 'That token could not be verified.' });
  }
}
