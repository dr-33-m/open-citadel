/**
 * The only file that talks to RevenueCat.
 *
 * Deliberately shaped like `services/account.ts`, which is the only file that
 * talks to Logto, and for the same reason: a purchase SDK reached into from
 * five places is five places to get identity, error handling and the
 * configured-or-not check subtly different. Everything above this imports
 * these functions and nothing else.
 *
 * ## What this module does NOT decide
 *
 * Whether a reader has a plan. `CustomerInfo` is the store's opinion and the
 * app draws from it only in passing; the server is authoritative, because it
 * is the thing that has to refuse a turn. The purchase flow here ends by
 * telling the caller "the store says this worked", and the caller asks the
 * server what that means.
 */
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

import { REVENUECAT_API_KEY, REVENUECAT_OFFERING, PURCHASES_ENABLED } from '@/constants/revenuecat';

/**
 * Closing the store sheet is a decision, not a failure.
 *
 * Its own error type for the same reason `AccountCancelled` is one: telling
 * somebody their own choice went wrong is worse than saying nothing, and the
 * only way to say nothing is to be able to tell the two apart.
 */
export class PurchaseCancelled extends Error {
  constructor() {
    super('Purchase cancelled.');
    this.name = 'PurchaseCancelled';
  }
}

/** This build has no RevenueCat key, so there is nothing to buy. */
export class PurchasesUnavailable extends Error {
  constructor() {
    super('This build cannot take payments.');
    this.name = 'PurchasesUnavailable';
  }
}

let configured = false;

/**
 * Start the SDK, once.
 *
 * Called from the account store rather than at module load, because
 * `appUserID` is the point: configuring anonymously and identifying later
 * makes RevenueCat mint a throwaway customer and then alias it, which leaves
 * a trail of empty customers and a window where a purchase can land on the
 * wrong one. Passing the Logto subject up front means the customer is the
 * account from its first breath.
 *
 * Safe to call repeatedly; only the first call configures.
 */
export function configurePurchases(appUserID: string | null): void {
  if (!PURCHASES_ENABLED || configured) return;
  if (__DEV__) void Purchases.setLogLevel(LOG_LEVEL.WARN);
  Purchases.configure({ apiKey: REVENUECAT_API_KEY, appUserID });
  configured = true;
}

/**
 * Tie the RevenueCat customer to the Logto account.
 *
 * `app_user_id` IS the Logto subject. That equality is what lets the server
 * read a webhook's `app_user_id`, prefix it, and have it be the same
 * `account:<sub>` the credit ledger is keyed on - with no mapping table to
 * drift. Changing it here breaks billing silently.
 */
export async function identify(sub: string): Promise<void> {
  if (!PURCHASES_ENABLED) return;
  configurePurchases(sub);
  await Purchases.logIn(sub);
}

/**
 * Forget the account on sign-out.
 *
 * RevenueCat moves to a fresh anonymous customer, so the next person to sign
 * in on this device does not inherit the last one's entitlements.
 */
export async function forget(): Promise<void> {
  if (!PURCHASES_ENABLED || !configured) return;
  await Purchases.logOut();
}

/**
 * The plans on sale, or null if the offering is empty.
 *
 * Asked for by name rather than taken from `offerings.current`, so an
 * experiment or a targeting rule cannot change what the app sells without
 * somebody choosing that. Null rather than a throw: an offering that has not
 * been configured yet is a state the panel can draw.
 */
export async function getOffering(): Promise<PurchasesOffering | null> {
  if (!PURCHASES_ENABLED) throw new PurchasesUnavailable();
  const offerings = await Purchases.getOfferings();
  return offerings.all[REVENUECAT_OFFERING] ?? offerings.current ?? null;
}

/**
 * Buy one package.
 *
 * Throws `PurchaseCancelled` when the reader closed the sheet, so the caller
 * can say nothing at all. Every other failure carries its own message.
 */
export async function purchase(pkg: PurchasesPackage): Promise<CustomerInfo> {
  if (!PURCHASES_ENABLED) throw new PurchasesUnavailable();
  try {
    const result = await Purchases.purchasePackage(pkg);
    return result.customerInfo;
  } catch (error) {
    if (isCancellation(error)) throw new PurchaseCancelled();
    throw error;
  }
}

/** Bring back a plan bought on another device, or before a reinstall. */
export async function restore(): Promise<CustomerInfo> {
  if (!PURCHASES_ENABLED) throw new PurchasesUnavailable();
  return Purchases.restorePurchases();
}

/**
 * Did the reader close the sheet?
 *
 * Both shapes are checked because `userCancelled` is deprecated in favour of
 * the error code and neither is guaranteed across the platforms this ships
 * on. Getting this wrong shows somebody an error for having changed their
 * mind, so it is worth being generous about the shape.
 */
function isCancellation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { userCancelled?: unknown; code?: unknown };
  if (candidate.userCancelled === true) return true;
  return candidate.code === '1' || candidate.code === 1 || candidate.code === 'PURCHASE_CANCELLED';
}
