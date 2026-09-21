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

/**
 * The store says this account already owns the product.
 *
 * On Android a reinstall wipes the guest identity, so a reader who paid
 * arrives as nobody, sees the plans and taps Buy. Play answers
 * `ITEM_ALREADY_OWNED`. What they meant was restore, so the caller does that
 * instead of showing a message that sounds like a failure.
 */
export class AlreadyPurchased extends Error {
  constructor() {
    super('You already own this plan.');
    this.name = 'AlreadyPurchased';
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
  Purchases.configure({
    apiKey: REVENUECAT_API_KEY,
    appUserID,
    /*
     * Signs the SDK's responses, and does nothing else.
     *
     * `INFORMATIONAL` rather than off: a forged `CustomerInfo` is reported
     * and still honoured. It cannot let anybody in here, because nothing in
     * this app grants access from `CustomerInfo` - the server decides, and it
     * asks RevenueCat itself. What a tampered response COULD do is draw a
     * renewal date that is not real, and this is how that becomes visible
     * rather than silent.
     *
     * Not `ENFORCED`, which flips `isActive` to false on a failed signature.
     * That trades a real reader behind a corporate proxy for a guarantee we
     * do not rely on, and the one thing worse than a wrong renewal date is
     * telling somebody who paid that they did not.
     */
    entitlementVerificationMode: Purchases.ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL,
  });
  configured = true;
}

/**
 * The join in flight, or the one that has landed, for the account it is for.
 *
 * Kept so a second caller waits on the first rather than starting another
 * `logIn`. See `identify`.
 */
let identified: { sub: string; done: Promise<void> } | null = null;

/**
 * Tie the RevenueCat customer to whoever is buying.
 *
 * `app_user_id` IS the ledger key, and that equality is the whole billing
 * design: the server reads a webhook's `app_user_id` and has the row it needs
 * with no mapping table to drift. Changing it here breaks billing silently.
 *
 * Two shapes reach it. A Logto subject, which the server prefixes into
 * `account:<sub>`. Or a `guest:<uuid>` minted on the device at the moment of
 * purchase, which it takes as the key unchanged - that is what lets somebody
 * buy a plan without registering. See `services/guest-identity`.
 *
 * Idempotent, and that is what makes it safe to await before a purchase. The
 * account store fires this on sign-in and does not wait, because a session is
 * real whether or not a purchases SDK could be reached; a purchase started
 * moments later must NOT proceed on that basis, or it lands on the anonymous
 * customer the app was configured with while signed out. Calling it again
 * returns the same promise, so the checkout waits for the join the sign-in
 * already began instead of racing a second one against it.
 *
 * A failed join is not remembered. Caching a rejection would leave every
 * later wait resolving against an identity RevenueCat never took.
 */
export function identify(sub: string): Promise<void> {
  if (!PURCHASES_ENABLED) return Promise.resolve();
  configurePurchases(sub);
  if (identified?.sub === sub) return identified.done;

  const done = Purchases.logIn(sub)
    .then(({ created }) => {
      /*
       * `created` is the one cheap answer to a question the guest design
       * leaves open: whether logging in from `guest:<uuid>` to a Logto
       * subject ALIASES the two customers or switches between them. False
       * means RevenueCat found a customer already there. Worth a line during
       * the device pass, because the answer decides whether the app should
       * `logOut` first, and the alternative is reading it off the dashboard
       * afterwards. Nothing branches on it: the server link is authoritative
       * either way.
       */
      if (__DEV__) console.log(`[Purchases] Joined ${sub} (new customer: ${created}).`);
    })
    .catch((error: unknown) => {
      if (identified?.sub === sub) identified = null;
      throw error;
    });
  identified = { sub, done };
  return done;
}

/**
 * Forget the account on sign-out.
 *
 * RevenueCat moves to a fresh anonymous customer, so the next person to sign
 * in on this device does not inherit the last one's entitlements.
 */
export async function forget(): Promise<void> {
  if (!PURCHASES_ENABLED || !configured) return;
  // Dropped first: a join remembered across a sign-out would have the next
  // `identify` for that same account return a promise for a customer this
  // device is no longer logged in as.
  identified = null;
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
  // `configured` as well as the key, matching `readCustomerInfo`. Without it
  // an SDK that was never started threw the SDK's own "no singleton instance"
  // from inside the panel's first effect, which reads as a crash rather than
  // as the one thing it is: this build has nothing to sell yet.
  if (!PURCHASES_ENABLED || !configured) throw new PurchasesUnavailable();
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
 * can say nothing at all, and `AlreadyPurchased` when the store says they
 * own it, so the caller can restore. Every other failure carries its own
 * message.
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
    if (isAlreadyPurchased(error)) {
      // Kept until the shape has been read off a real Android device; see
      // TODO-ANDROID.md.
      // Fields picked out by hand: `message` is not enumerable on an Error,
      // so stringifying the whole thing would drop it.
      if (__DEV__) {
        const { code, message, userInfo } = error as {
          code?: unknown;
          message?: unknown;
          userInfo?: unknown;
        };
        console.log('[Purchases] Already purchased:', JSON.stringify({ code, message, userInfo }));
      }
      throw new AlreadyPurchased();
    }
    throw error;
  }
}

/** Bring back a plan bought on another device, or before a reinstall. */
export async function restore(): Promise<CustomerInfo> {
  if (!PURCHASES_ENABLED) throw new PurchasesUnavailable();
  return Purchases.restorePurchases();
}

/** The guest this session already asked Play about. See `reclaimStorePurchases`. */
let reclaimedFor: string | null = null;

/**
 * Before selling to a guest on Android, bring back anything this Google
 * account already pays for.
 *
 * A reinstall wipes the guest identity, and a fresh id has no history at
 * RevenueCat, so nothing but the Play account remembers the plan. Play only
 * refuses a second purchase of the SAME product; tapping a different plan
 * would start a second subscription beside the first, because a Play plan
 * change has to name the product it replaces and nothing here knows it yet.
 * Restoring first moves the old plan onto this id, and the checkout then
 * sees an active plan instead of selling one.
 *
 * Returns whether an entitlement came back. Once per guest per session,
 * never for an account (a restore there could move a plan off a different
 * account sharing this Google account), and never on iOS, where
 * subscription groups already turn a second purchase into a plan change.
 */
export async function reclaimStorePurchases(guestId: string): Promise<boolean> {
  if (!PURCHASES_ENABLED || !configured || REVENUECAT_TEST_STORE) return false;
  if (Platform.OS !== 'android' || reclaimedFor === guestId) return false;
  const customerInfo = await Purchases.restorePurchases();
  reclaimedFor = guestId;
  return Object.keys(customerInfo.entitlements.active).length > 0;
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

const ALREADY_PURCHASED_NAMES = new Set([
  'PRODUCT_ALREADY_PURCHASED',
  'PRODUCT_ALREADY_PURCHASED_ERROR',
  'ProductAlreadyPurchasedError',
]);

/**
 * Does the store say the reader already owns this?
 *
 * The Android bridge rejects with the numeric code as a string ("6"), and
 * the readable name has lived both on the error and in `userInfo`. As with
 * `isCancellation`, every shape is accepted, because missing this one tells
 * a paying reader something that sounds like a failure.
 */
export function isAlreadyPurchased(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    code?: unknown;
    readableErrorCode?: unknown;
    userInfo?: { readableErrorCode?: unknown } | null;
  };
  if (candidate.code === '6' || candidate.code === 6) return true;
  const names = [candidate.code, candidate.readableErrorCode, candidate.userInfo?.readableErrorCode];
  return names.some((name) => typeof name === 'string' && ALREADY_PURCHASED_NAMES.has(name));
}
