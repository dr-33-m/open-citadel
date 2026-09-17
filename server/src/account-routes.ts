/**
 * Deleting an account.
 *
 * One route, because there is one thing an account holder can ask this server
 * to do about the account itself. Everything else about them (their plan,
 * their credits, their usage) is read through /billing.
 *
 * The order is deliberate: this server's rows first, then RevenueCat, then
 * the Logto user last. Logto is what a token is verified against, so deleting
 * it first would lock the reader out of the retry that finishes the job.
 *
 * What this does NOT touch is the phone. Books, highlights, notes and goals
 * are local and belong to the reader, not to the account, and the app says so
 * before it asks.
 */
import { Hono } from 'hono';

import { deleteAccountData } from './db.js';
import { readIdentity } from './identity.js';
import { deleteLogtoUser } from './logto-management.js';

export const accountRoutes = new Hono();

const REVENUECAT_SUBSCRIBERS = 'https://api.revenuecat.com/v1/subscribers';

/**
 * Forgets the reader at RevenueCat, best effort.
 *
 * Their customer record is keyed by the Logto subject (see `bindPurchases` in
 * the app), so it is an identifier tied to an account that is about to stop
 * existing. Failures are logged and swallowed: the store's own record of a
 * purchase is Apple's, not ours, and a RevenueCat outage must not leave a
 * reader unable to delete their account.
 */
async function forgetRevenueCatCustomer(sub: string): Promise<void> {
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY?.trim();
  if (!apiKey) return;

  try {
    const response = await fetch(`${REVENUECAT_SUBSCRIBERS}/${encodeURIComponent(sub)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok && response.status !== 404) {
      console.error(`[Account] RevenueCat delete refused (${response.status}) for ${sub}`);
    }
  } catch (error) {
    console.error('[Account] RevenueCat delete failed:', error);
  }
}

accountRoutes.delete('/', async (c) => {
  const { id: accountId, sub } = await readIdentity(c);

  await deleteAccountData(accountId);
  await forgetRevenueCatCustomer(sub);
  await deleteLogtoUser(sub);

  console.log(`[Account] Deleted ${accountId}`);
  return c.json({ deleted: true });
});
