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
 * Set once this device's guest has joined an account, and never cleared.
 *
 * Holds the retired guest id. Its whole job is to stop the device minting a
 * second guest: a linked device that buys or restores signed out would
 * otherwise become a new RevenueCat customer, the store would move the
 * account's subscription onto it, and signing back in would move it home
 * again. The account is where a plan lives once somebody has made one.
 */
const LINKED_KEY = 'samwell.guest.linked';

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

/**
 * This device's guest has joined an account, so its own credential is
 * finished and it may not become a guest again.
 *
 * Its own type because it is the one refusal that is not a failure, and the
 * one the caller can act on: there is nothing to retry and nothing to repair.
 * The link hook lets the credential go; the checkout sends the reader to
 * sign in. Told apart from a flat refusal for
 * the same reason `PurchaseCancelled` is told apart from a failed purchase.
 */
export class GuestLinked extends Error {
  constructor() {
    super('This device now belongs to an account.');
    this.name = 'GuestLinked';
  }
}

/** Held in memory only. A bearer token is not worth persisting when the
 *  secret can mint another in one request. */
let cachedToken: { token: string; expiresAtMs: number } | null = null;
let tokenInFlight: Promise<string> | null = null;
/** What the Keychain last said, absence included. See `readGuestIdentity`. */
let identityCache: { value: GuestIdentity | null } | null = null;
/**
 * The mint in flight, so two callers cannot each make one.
 *
 * Without it both see no identity, both generate their own id and secret, and
 * the four Keychain writes interleave - leaving this device holding one
 * caller's id beside the other's secret. The server has each pair registered
 * correctly, so that mongrel matches neither: the token is refused, the repair
 * tries to register an id that is taken, and the device is stuck for good with
 * a subscription it cannot prove it owns.
 */
let mintInFlight: Promise<GuestIdentity> | null = null;
/**
 * Bumped by `retireGuestIdentity`, so work that began while this device was a
 * guest and finished after it stopped can tell that it is out of date.
 *
 * Linking is the only thing that ends a guest identity, and it can land in the
 * middle of either half of a token fetch: the Keychain read, which would
 * otherwise answer with a deleted identity and cache it, or the exchange
 * itself, which would otherwise leave a live credential for that identity
 * sitting in memory.
 */
let generation = 0;

function baseUrl(): string {
  return SAMWELL_CLOUD_BASE_URL.trim().replace(/\/+$/, '');
}

/**
 * The identity this device already has, or null. Never mints one.
 *
 * Remembered in memory once read, absence included. `cloudHeaders` asks for a
 * token on every request a signed-out reader makes, and without this every
 * one of them would be two Keychain reads to learn the same "no" again.
 */
export async function readGuestIdentity(): Promise<GuestIdentity | null> {
  if (identityCache) return identityCache.value;

  const mine = generation;
  const [guestId, secret] = await Promise.all([
    SecureStore.getItemAsync(ID_KEY, STORE_OPTIONS),
    SecureStore.getItemAsync(SECRET_KEY, STORE_OPTIONS),
  ]);
  // The read began before the device stopped being a guest and finished
  // after, so what came back is a deleted identity. Answering with it would
  // put the stale one back in the cache for everybody behind us.
  if (generation !== mine) return null;

  // Half an identity is no identity. Treated as absent so the next purchase
  // mints a whole one rather than carrying a secret with no id to use it.
  const value = guestId && secret ? { guestId, secret } : null;
  /*
   * Never overwrites, and that is the point. A read that began before the
   * device became a guest finishes after `ensureGuestIdentity` has already
   * written the real answer here, and assigning would put its "no" back on
   * top of an identity that exists - leaving a reader who has just paid with
   * no credential to spend it. First writer wins, and the explicit writers
   * are the ones that actually changed the Keychain.
   */
  identityCache ??= { value };
  return identityCache.value;
}

/**
 * The identity to buy against, minting and registering one if needed.
 *
 * Written to the Keychain before the server is told, and answered with even
 * if the server could not be told at all. This is the one call whose failure
 * must not stop anything: it runs at the moment of purchase, the store sheet
 * is about to open, and a reader whose connection is good enough for Apple
 * but not for us should still be able to pay. The id is what RevenueCat is
 * about to be given, so the purchase lands somewhere the webhook can credit
 * either way, and `guestToken` registers again the moment it finds the server
 * does not know this device.
 *
 * An identity that already exists is returned as it stands, with no call to
 * the server. Re-registering on every purchase would be a round trip to learn
 * a thing we already know, and the repair path above covers the one case
 * where the server has somehow never heard of it.
 */
export async function ensureGuestIdentity(): Promise<GuestIdentity> {
  const existing = await readGuestIdentity();
  if (existing) return existing;
  // One guest per device. Once it has joined an account, the account buys.
  if (await readLinkedGuest()) throw new GuestLinked();

  mintInFlight ??= mint().finally(() => {
    mintInFlight = null;
  });
  return mintInFlight;
}

async function mint(): Promise<GuestIdentity> {
  const identity: GuestIdentity = {
    guestId: `guest:${Crypto.randomUUID()}`,
    secret: toHex(await Crypto.getRandomBytesAsync(32)),
  };
  await Promise.all([
    SecureStore.setItemAsync(ID_KEY, identity.guestId, STORE_OPTIONS),
    SecureStore.setItemAsync(SECRET_KEY, identity.secret, STORE_OPTIONS),
  ]);
  identityCache = { value: identity };
  try {
    await registerGuest(identity);
  } catch (error) {
    if (__DEV__) console.warn('[Guest] Could not register this device yet:', error);
  }
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
  // Read before the first await, so a forget that lands while the Keychain is
  // being read still counts as having happened after this call began.
  const mine = generation;

  const fresh = cachedToken && cachedToken.expiresAtMs > Date.now() ? cachedToken.token : null;
  if (fresh) return fresh;

  const identity = await readGuestIdentity();
  if (!identity) return null;

  // One exchange at a time. Several requests waking together must not each
  // ask for their own token and then race to cache the last one.
  tokenInFlight ??= exchange(identity, mine).finally(() => {
    tokenInFlight = null;
  });
  return tokenInFlight;
}

/** Told when this device's guest retires. See `onGuestRetired`. */
const retiredListeners = new Set<() => void>();

/**
 * Hear about a retirement however it happened.
 *
 * The link hook retires the guest itself, but a device can also learn of the
 * link from the server refusing its token - the link landed, its reply never
 * came home, and the reader signed out before the retry. That happens deep in
 * a token fetch, below anything that draws, so this is how the guest store
 * finds out without the service reaching up into it.
 */
export function onGuestRetired(listener: () => void): () => void {
  retiredListeners.add(listener);
  return () => {
    retiredListeners.delete(listener);
  };
}

/**
 * The guest id this device retired when it joined an account, or null if it
 * never has. See `LINKED_KEY`.
 */
export async function readLinkedGuest(): Promise<string | null> {
  return SecureStore.getItemAsync(LINKED_KEY, STORE_OPTIONS);
}

/**
 * Stop being a guest, for good.
 *
 * Called once the device's guest has joined an account. The secret goes -
 * the server refuses to mint against a linked guest anyway, and a live
 * credential for a plan the account now owns is one more thing to steal -
 * but the fact of the link stays, so `ensureGuestIdentity` never mints this
 * device a second guest. Written before the deletes: a crash between them
 * leaves a device that is linked and still holds a secret the server
 * refuses, never one that has forgotten it was linked.
 */
export async function retireGuestIdentity(): Promise<void> {
  // Before the first await, so a token fetch already reading the Keychain
  // finds out it is out of date. See `generation`.
  generation += 1;
  cachedToken = null;
  identityCache = { value: null };
  const guestId = await SecureStore.getItemAsync(ID_KEY, STORE_OPTIONS);
  if (guestId) await SecureStore.setItemAsync(LINKED_KEY, guestId, STORE_OPTIONS);
  await Promise.all([
    SecureStore.deleteItemAsync(ID_KEY, STORE_OPTIONS),
    SecureStore.deleteItemAsync(SECRET_KEY, STORE_OPTIONS),
  ]);
  for (const listener of retiredListeners) listener();
}

/**
 * Drop everything held in memory, keeping everything that is stored.
 *
 * Both caches are memoised reads of durable state - the Keychain and the
 * server - so throwing them away is always safe and never loses anything. For
 * a sign-out, where an account has taken over as the identity and the token
 * belonging to the phone should not be sitting in memory behind it.
 */
export function clearGuestToken(): void {
  cachedToken = null;
  identityCache = null;
}

async function exchange(identity: GuestIdentity, mine: number): Promise<string> {
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
    /*
     * Worth a line of its own, because the status is the whole diagnosis and
     * by the time this reaches the reader it has become "could not check your
     * credits". 401 after the repair means the server does not know this
     * device and registering did not fix it; 409 means it knows the id under
     * a different secret, which this device cannot talk its way out of; 503
     * means the deployment has no `GUEST_TOKEN_SECRET`.
     */
    if (__DEV__) {
      console.warn(
        `[Guest] Token refused (${response.status}) for ${identity.guestId}.`,
      );
    }
    /*
     * The one refusal with somewhere to go. See `GuestLinked`. Remembered
     * here as well as by the link hook, because a device can learn it while
     * signed out: the link landed and its answer never came home.
     */
    if (response.status === 409) {
      await retireGuestIdentity();
      throw new GuestLinked();
    }
    throw new Error(`Guest token refused (${response.status}).`);
  }
  const body = (await response.json()) as { token?: string; expiresIn?: number };
  if (!body.token) throw new Error('Guest token response did not match.');

  // The device may have stopped being a guest while this was in flight, in
  // which case the token is still good but belongs to nobody. Return it to the
  // caller that asked, keep it out of the cache.
  if (generation === mine) {
    cachedToken = {
      token: body.token,
      expiresAtMs: Date.now() + Math.max(0, (body.expiresIn ?? 0) * 1000 - EXPIRY_SKEW_MS),
    };
  }
  return body.token;
}

async function registerGuest(identity: GuestIdentity): Promise<void> {
  const response = await postJson('/account/guest', identity);
  // 409 is this id under a different secret, which a v4 UUID does not do; if
  // it ever happens, minting another would be the repair and it is not one to
  // guess at silently.
  if (!response.ok) {
    if (__DEV__) {
      console.warn(
        `[Guest] Registration refused (${response.status}) for ${identity.guestId}.`,
      );
    }
    throw new Error(`Guest registration refused (${response.status}).`);
  }
}

/**
 * A hung request here is worse than a failed one. `cloudHeaders` awaits this
 * before every metered call, so a server that accepts the connection and then
 * says nothing would stall the chat turn behind it with no error to show.
 *
 * `AbortController` plus a timer rather than `AbortSignal.timeout`, matching
 * `stores/subscription` and its siblings - Hermes does not ship the static
 * helper.
 */
const REQUEST_TIMEOUT_MS = 15_000;

async function postJson(path: string, body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${baseUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
