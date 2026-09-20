import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { SAMWELL_CLOUD_BASE_URL } from '@/constants/samwell-cloud';

/**
 * This device, as somebody who paid without making an account.
 *
 * Two values, minted here and kept in the Keychain: an id, which becomes the
 * RevenueCat `app_user_id` so a purchase and its renewals land somewhere the
 * server can meter, and a secret, which is the credential that buys a
 * short-lived token for the metered routes.
 *
 * Keeping those two jobs in separate values is the point. RevenueCat's own
 * guidance is that an `app_user_id` must never be used as a credential, since
 * it is neither secret nor securely stored. The id here travels to RevenueCat
 * and appears in webhooks; the secret never leaves the Keychain except to ask
 * for a token, and the server keeps only its hash.
 *
 * Nothing here identifies a person. That is the whole idea: the server learns
 * that a device paid, and nothing else about whoever is holding it.
 *
 * ## When an identity is minted
 *
 * At the moment of purchase, never at launch. An install that never buys
 * anything should not be registering itself with a server, and a guest gets
 * no free credits anyway - the onboarding concierge is account-based, which
 * is what stops a reinstall farming it.
 */

const ID_KEY = 'samwell.guest.id';
const SECRET_KEY = 'samwell.guest.secret';

/**
 * Stays on this device and out of any backup.
 *
 * A restored iCloud or Android backup landing on a second phone would
 * otherwise carry a credential for a subscription that phone does not hold,
 * which is a copy of the identity rather than a move of it.
 */
const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Asked for again a minute before it lapses, so a request never carries one
 *  that expires in flight. */
const EXPIRY_SKEW_MS = 60_000;

export type GuestIdentity = { guestId: string; secret: string };

/** Held in memory only. A bearer token is not worth persisting when the
 *  secret can mint another in one request. */
let cachedToken: { token: string; expiresAtMs: number } | null = null;
let tokenInFlight: Promise<string> | null = null;

function baseUrl(): string {
  return SAMWELL_CLOUD_BASE_URL.trim().replace(/\/+$/, '');
}

/** The identity this device already has, or null. Never mints one. */
export async function readGuestIdentity(): Promise<GuestIdentity | null> {
  const [guestId, secret] = await Promise.all([
    SecureStore.getItemAsync(ID_KEY, STORE_OPTIONS),
    SecureStore.getItemAsync(SECRET_KEY, STORE_OPTIONS),
  ]);
  // Half an identity is no identity. Treated as absent so the next purchase
  // mints a whole one rather than carrying a secret with no id to use it.
  if (!guestId || !secret) return null;
  return { guestId, secret };
}

/**
 * The identity to buy against, minting and registering one if needed.
 *
 * Written to the Keychain before the server is told, deliberately. If
 * registration fails the identity is still the one RevenueCat will be given,
 * so a purchase made on a bad connection still lands somewhere the webhook
 * can credit; `guestToken` registers again when it finds the server does not
 * know this device yet.
 */
export async function ensureGuestIdentity(): Promise<GuestIdentity> {
  const existing = await readGuestIdentity();
  if (existing) {
    await registerGuest(existing).catch(() => undefined);
    return existing;
  }

  const identity: GuestIdentity = {
    guestId: `guest:${Crypto.randomUUID()}`,
    secret: toHex(await Crypto.getRandomBytesAsync(32)),
  };
  await Promise.all([
    SecureStore.setItemAsync(ID_KEY, identity.guestId, STORE_OPTIONS),
    SecureStore.setItemAsync(SECRET_KEY, identity.secret, STORE_OPTIONS),
  ]);
  await registerGuest(identity);
  return identity;
}

/**
 * A token for the metered routes, or null when this device is not a guest.
 *
 * Null rather than a throw for the one case that is not a failure: nobody has
 * ever bought anything here, so there is no identity and nothing to send. A
 * network problem still throws, because that is a request that should be
 * retried rather than quietly downgraded to anonymous.
 */
export async function guestToken(): Promise<string | null> {
  const fresh = cachedToken && cachedToken.expiresAtMs > Date.now() ? cachedToken.token : null;
  if (fresh) return fresh;

  const identity = await readGuestIdentity();
  if (!identity) return null;

  // One exchange at a time. Several requests waking together must not each
  // ask for their own token and then race to cache the last one.
  tokenInFlight ??= exchange(identity).finally(() => {
    tokenInFlight = null;
  });
  return tokenInFlight;
}

/**
 * Stop being a guest.
 *
 * Called once the device's plan has been moved onto an account. The secret is
 * the only thing that has to go - the server refuses to mint against a linked
 * guest anyway, so this is belt and braces - but leaving a live credential in
 * the Keychain for a subscription somebody else now owns is one more thing to
 * steal.
 */
export async function forgetGuestIdentity(): Promise<void> {
  cachedToken = null;
  await Promise.all([
    SecureStore.deleteItemAsync(ID_KEY, STORE_OPTIONS),
    SecureStore.deleteItemAsync(SECRET_KEY, STORE_OPTIONS),
  ]);
}

/** Drops the cached token without touching the identity, for a sign-out. */
export function clearGuestToken(): void {
  cachedToken = null;
}

async function exchange(identity: GuestIdentity): Promise<string> {
  let response = await postJson('/account/guest/token', identity);

  /*
   * The server has never heard of this device: registration failed earlier,
   * or its row is gone. Registering and asking once more is the whole repair,
   * and it happens on the request that needed the token rather than as a
   * separate thing to remember.
   */
  if (response.status === 401) {
    await registerGuest(identity);
    response = await postJson('/account/guest/token', identity);
  }

  if (!response.ok) {
    throw new Error(`Guest token refused (${response.status}).`);
  }
  const body = (await response.json()) as { token?: string; expiresIn?: number };
  if (!body.token) throw new Error('Guest token response did not match.');

  cachedToken = {
    token: body.token,
    expiresAtMs: Date.now() + Math.max(0, (body.expiresIn ?? 0) * 1000 - EXPIRY_SKEW_MS),
  };
  return body.token;
}

async function registerGuest(identity: GuestIdentity): Promise<void> {
  const response = await postJson('/account/guest', identity);
  // 409 is this id under a different secret, which a v4 UUID does not do; if
  // it ever happens, minting another would be the repair and it is not one to
  // guess at silently.
  if (!response.ok) throw new Error(`Guest registration refused (${response.status}).`);
}

function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
