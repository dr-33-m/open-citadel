/**
 * A reader who paid without making an account.
 *
 * App Review's reading of guideline 5.1.1(v) is that a subscription may not
 * sit behind registration unless the purchase is tied to account-specific
 * functionality. Rather than argue the exception, a device can buy a plan on
 * its own: it mints a random id and a random secret, keeps both in the
 * Keychain, and hands us the id as its RevenueCat `app_user_id`. We never
 * learn a name, an email, or anything else about the person holding it.
 *
 * ## What makes this safe
 *
 * The id is an identifier and the secret is the credential, and the two are
 * deliberately separate. RevenueCat's own guidance is that an anonymous
 * `app_user_id` must never be used as a credential, because it is neither
 * secret nor stored securely - so we mint our own, keep the secret in secure
 * storage on the device, and keep only its hash here.
 *
 * The secret buys a short-lived JWT. Every metered route then accepts that
 * token exactly as it accepts a Logto one, which is why `readIdentity` is the
 * only place that knows there are two kinds.
 *
 * ## Linking
 *
 * `Purchases.logIn` reliably merges only when moving OFF an anonymous id.
 * Guest to account is identified to identified, where RevenueCat's own
 * guidance is ambiguous: it may alias the two, or it may switch and leave the
 * subscription on the guest id along with its renewals. So the mapping is
 * ours to keep, and correct either way. `linked_account_id` is read by the
 * webhook on the way in and by the entitlement reconcile on the way out, and
 * those two lookups are what make a link durable rather than a one-time move.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

import { SignJWT, jwtVerify } from 'jose';
import { SAMWELL_API_RESOURCE } from 'samwell-shared';

import { db } from './db.js';

/** Issuer on the tokens this server signs, so they can never be confused
 *  with Logto's. See `readIdentity`. */
export const GUEST_ISSUER = 'samwell-cloud/guest';
/** Short, because the secret can always mint another. */
const TOKEN_TTL_SECONDS = 60 * 60;
/** `guest:` then a v4 UUID, which is what the app generates. */
const GUEST_ID_PATTERN = /^guest:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** 32 bytes, hex encoded. Anything else is not something we minted. */
const SECRET_PATTERN = /^[0-9a-f]{64}$/;

export function isGuestId(id: string): boolean {
  return GUEST_ID_PATTERN.test(id);
}

export function isGuestSecret(secret: string): boolean {
  return SECRET_PATTERN.test(secret);
}

function signingKey(): Uint8Array {
  const secret = process.env.GUEST_TOKEN_SECRET?.trim();
  /*
   * Deliberately fatal rather than falling back to a default. A predictable
   * signing key would let anyone mint an identity and spend somebody else's
   * credits, and a server that quietly starts without one is the kind of
   * thing nobody notices until it is being exploited.
   */
  if (!secret || secret.length < 32) {
    throw new Error('GUEST_TOKEN_SECRET is not configured (needs 32+ characters).');
  }
  return new TextEncoder().encode(secret);
}

/** Whether guest access is available at all on this deployment. */
export function guestAccessConfigured(): boolean {
  const secret = process.env.GUEST_TOKEN_SECRET?.trim();
  return Boolean(secret && secret.length >= 32);
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/** Constant time, so a wrong secret cannot be discovered a byte at a time. */
function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export interface GuestRow {
  guestId: string;
  secretSha256: string;
  linkedAccountId: string | null;
}

export async function readGuest(guestId: string): Promise<GuestRow | null> {
  const result = await db.execute({
    sql: `SELECT guest_id, secret_sha256, linked_account_id
          FROM guest_identities WHERE guest_id = ?`,
    args: [guestId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    guestId: String(row.guest_id),
    secretSha256: String(row.secret_sha256),
    linkedAccountId: row.linked_account_id == null ? null : String(row.linked_account_id),
  };
}

export type RegisterResult = 'created' | 'exists' | 'taken';

/**
 * Record a device's guest identity.
 *
 * Creates no credits and grants nothing: a guest who never buys anything
 * holds an empty row, and the free onboarding grant stays account-only so a
 * reinstall cannot farm it. That was the hole in the device ids this server
 * used to run on.
 *
 * Re-registering with the same secret is a success, because the app may retry
 * after a dropped response and there is nothing to change. The same id with a
 * different secret is `taken` - almost certainly a UUID collision that never
 * happens, and the one shape that would let somebody claim another device's
 * identity if it did.
 */
export async function registerGuest(guestId: string, secret: string): Promise<RegisterResult> {
  const existing = await readGuest(guestId);
  if (existing) {
    return hashesMatch(existing.secretSha256, hashSecret(secret)) ? 'exists' : 'taken';
  }
  await db.execute({
    sql: `INSERT INTO guest_identities (guest_id, secret_sha256, created_at_ms)
          VALUES (?, ?, ?)`,
    args: [guestId, hashSecret(secret), Date.now()],
  });
  return 'created';
}

export type TokenResult =
  | { ok: true; token: string; expiresIn: number }
  | { ok: false; reason: 'unknown' | 'linked' };

/**
 * Trade the device secret for a token.
 *
 * Refused once the guest has been linked to an account: from then on the
 * device has a real session and must use it, and leaving a second credential
 * alive for the same subscription is one more thing to steal.
 */
export async function issueGuestToken(guestId: string, secret: string): Promise<TokenResult> {
  const row = await readGuest(guestId);
  // The same answer for "no such guest" and "wrong secret": which of the two
  // it is, is not something a caller should be able to learn.
  if (!row || !hashesMatch(row.secretSha256, hashSecret(secret))) {
    return { ok: false, reason: 'unknown' };
  }
  if (row.linkedAccountId) return { ok: false, reason: 'linked' };

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(guestId)
    .setIssuer(GUEST_ISSUER)
    .setAudience(SAMWELL_API_RESOURCE)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(signingKey());

  return { ok: true, token, expiresIn: TOKEN_TTL_SECONDS };
}

/**
 * The guest id a token carries, or a throw.
 *
 * Signature, issuer, audience and expiry, all four, for the same reason
 * `readIdentity` checks all four of Logto's: any one of them alone is a hole.
 * The subject is re-checked against the id pattern so a token cannot name
 * something that is not a guest at all.
 */
export async function verifyGuestToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, signingKey(), {
    issuer: GUEST_ISSUER,
    audience: SAMWELL_API_RESOURCE,
  });
  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  if (!isGuestId(sub)) throw new Error('That token does not name a guest.');
  return sub;
}
