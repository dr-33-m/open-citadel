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
import { Linking, Platform } from 'react-native';
import Purchases, {
    LOG_LEVEL,
    STORE_REPLACEMENT_MODE,
    type CustomerInfo,
    type PurchasesOffering,
    type PurchasesPackage,
    type StoreProductChangeInfo,
} from 'react-native-purchases';

import {
    PURCHASES_ENABLED,
    REVENUECAT_API_KEY,
    REVENUECAT_OFFERING,
    REVENUECAT_TEST_STORE,
} from '@/constants/revenuecat';
import { googleProductToReplace } from '@/services/purchase-lifecycle';

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
 * Replaces the SDK's default log handler, which sends its own ERROR-level
 * lines straight to `console.error` - including "expected" ones, like the
 * Test Store's simulated purchase failure, or a card the store itself
 * declined. Those are not app bugs, they are `purchase()` below rejecting
 * its promise exactly as designed, and the store already turns that into a
 * readable message in the UI. Left alone, the SDK's own log line ALSO trips
 * LogBox's full-screen red error on top of that, which is what actually
 * looked broken. Routed to `console.warn` instead: still visible for
 * debugging, no longer read by the reader as a crash.
 */
function forwardRevenueCatLog(logLevel: LOG_LEVEL, message: string): void {
  const line = `[RevenueCat] ${message}`;
  switch (logLevel) {
    case LOG_LEVEL.DEBUG:
      console.debug(line);
      break;
    case LOG_LEVEL.INFO:
      console.info(line);
      break;
    case LOG_LEVEL.WARN:
    case LOG_LEVEL.ERROR:
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}

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
  // Must run before `configure`: the SDK only installs its own default
  // handler if nobody has called `setLogHandler` yet.
  Purchases.setLogHandler(forwardRevenueCatLog);
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

/** Read CustomerInfo, optionally bypassing RevenueCat's local cache. */
export async function readCustomerInfo(fresh = false): Promise<CustomerInfo> {
  if (!PURCHASES_ENABLED || !configured) throw new PurchasesUnavailable();
  if (fresh) await Purchases.invalidateCustomerInfoCache();
  return Purchases.getCustomerInfo();
}

/** Subscribe once at app scope; returns the matching SDK cleanup operation. */
export function subscribeToCustomerInfo(
  listener: (customerInfo: CustomerInfo) => void,
): () => void {
  if (!PURCHASES_ENABLED || !configured) return () => undefined;
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}

/**
 * Buy one package.
 *
 * Throws `PurchaseCancelled` when the reader closed the sheet, so the caller
 * can say nothing at all. Every other failure carries its own message.
 */
export async function purchase(
  pkg: PurchasesPackage,
  options: { currentEntitlement?: string; deferred?: boolean } = {},
): Promise<CustomerInfo> {
  if (!PURCHASES_ENABLED) throw new PurchasesUnavailable();
  try {
    let productChangeInfo: StoreProductChangeInfo | null = null;
    if (
      options.currentEntitlement &&
      Platform.OS === 'android' &&
      !REVENUECAT_TEST_STORE
    ) {
      const customerInfo = await readCustomerInfo(true);
      productChangeInfo = {
        oldProductIdentifier: googleProductToReplace(
          customerInfo,
          options.currentEntitlement,
        ),
        replacementMode: options.deferred
          ? STORE_REPLACEMENT_MODE.DEFERRED
          : STORE_REPLACEMENT_MODE.CHARGE_PRORATED_PRICE,
      };
    }

    const result = await Purchases.purchasePackage(pkg, null, productChangeInfo);
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
 * Open the store surface where a subscription can be changed or cancelled.
 *
 * The Test Store has no App Store or Play account behind it, so there is no
 * management page to open. The caller explains that state instead of sending
 * the reader to a dead URL.
 */
export async function manageSubscription(): Promise<'opened' | 'test-store'> {
  if (!PURCHASES_ENABLED) throw new PurchasesUnavailable();
  if (REVENUECAT_TEST_STORE) return 'test-store';

  if (Platform.OS === 'ios') {
    await Purchases.showManageSubscriptions();
    return 'opened';
  }

  const customerInfo = await Purchases.getCustomerInfo();
  if (!customerInfo.managementURL) {
    throw new Error('The store could not find a subscription to manage.');
  }
  await Linking.openURL(customerInfo.managementURL);
  return 'opened';
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
