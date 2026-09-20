/**
 * The three things a device can ask about its own guest identity.
 *
 * Mounted under `/account` beside the delete route, because that is what these
 * are: account routes for a reader who has not made one. See
 * `guest-identity.ts` for why any of this exists.
 */
import { Hono } from 'hono';
import { z } from 'zod';

import { billing } from './billing.js';
import {
  guestAccessConfigured,
  isGuestId,
  isGuestSecret,
  issueGuestToken,
  registerGuest,
  verifyGuestToken,
} from './guest-identity.js';
import { readIdentity } from './identity.js';

export const guestRoutes = new Hono();

const CredentialsSchema = z.object({
  guestId: z.string().refine(isGuestId, 'Not a guest id.'),
  secret: z.string().refine(isGuestSecret, 'Not a guest secret.'),
});

/** Guest access needs a signing key, and a deployment without one has none. */
function unavailable(): Response {
  return Response.json(
    { error: 'guest_access_unavailable', message: 'This server does not take guests.' },
    { status: 503 },
  );
}

/**
 * Register a device.
 *
 * Grants nothing and creates no credits. A guest holds an empty row until a
 * purchase lands on it, which is what keeps the free onboarding grant
 * account-only and out of reach of a reinstall.
 */
guestRoutes.post('/guest', async (c) => {
  if (!guestAccessConfigured()) return unavailable();

  const parsed = CredentialsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'invalid_request' }, 400);
  }

  const result = await registerGuest(parsed.data.guestId, parsed.data.secret);
  if (result === 'taken') {
    // Only reachable through a UUID collision, which will not happen, or
    // somebody claiming an id that is not theirs, which must not work.
    return c.json({ error: 'guest_id_taken' }, 409);
  }
  return c.json({ guestId: parsed.data.guestId }, result === 'created' ? 201 : 200);
});

/** Trade the device secret for a short-lived token. */
guestRoutes.post('/guest/token', async (c) => {
  if (!guestAccessConfigured()) return unavailable();

  const parsed = CredentialsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'invalid_request' }, 400);
  }

  const result = await issueGuestToken(parsed.data.guestId, parsed.data.secret);
  if (!result.ok) {
    if (result.reason === 'linked') {
      /*
       * The device has an account now and must use it. Its own signal rather
       * than a bare 401, because the app can act on this one: sign in, rather
       * than mint another guest identity and orphan the subscription.
       */
      return c.json({ error: 'guest_linked' }, 409);
    }
    return c.json({ error: 'unknown_guest' }, 401);
  }
  return c.json({ token: result.token, expiresIn: result.expiresIn });
});

/**
 * Attach a guest's plan to the account they have just made.
 *
 * Both identities are proved in the one request: the account by its Logto
 * token in `Authorization`, the device by its guest token in
 * `X-Guest-Authorization`. Neither is taken on the other's word, because this
 * is the request that decides which account a subscription belongs to for the
 * rest of its life.
 *
 * Idempotent for the same pair. Calling it again after a success is a no-op
 * that reports the account's balance, so the app may retry a dropped
 * response without inventing a second outcome.
 */
guestRoutes.post('/link', async (c) => {
  if (!guestAccessConfigured()) return unavailable();

  const identity = await readIdentity(c);
  if (identity.kind !== 'account') {
    return c.json({ error: 'account_required' }, 403);
  }

  const header = c.req.header('x-guest-authorization')?.trim() ?? '';
  const guestToken = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!guestToken) {
    return c.json({ error: 'guest_token_required' }, 400);
  }

  let guestId: string;
  try {
    guestId = await verifyGuestToken(guestToken);
  } catch {
    return c.json({ error: 'guest_token_invalid' }, 401);
  }

  const result = await billing.linkGuest({ guestId, accountId: identity.id });
  if (!result.linked) {
    /*
     * Their account already holds a plan. Refused rather than merged, per the
     * decision recorded in GUEST-ACCESS-PLAN.md: nothing is taken from either
     * side, and the app says so plainly.
     */
    return c.json({ error: result.reason }, 409);
  }

  console.log(`[Guest] Linked ${guestId} to ${identity.id}`);
  return c.json({ linked: true, balance: result.balance });
});
