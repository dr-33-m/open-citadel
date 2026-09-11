import type {
    CustomerInfo,
    PurchasesOffering,
    PurchasesPackage,
} from 'react-native-purchases';
import {
    CREDIT_PLANS,
    NO_PLAN_BALANCE,
    planRank,
    type CloudModelOption,
    type CreditBalance,
    type PlanId,
} from 'samwell-shared';
import { create } from 'zustand';

import { PURCHASES_ENABLED } from '@/constants/revenuecat';
import { SAMWELL_CLOUD_BASE_URL } from '@/constants/samwell-cloud';
import { cloudHeaders, cloudJsonHeaders } from '@/services/cloud-identity';
import {
    subscriptionLifecycle,
    type SubscriptionLifecycle,
} from '@/services/purchase-lifecycle';
import {
    PurchaseCancelled,
    purchase as buyPackage,
    getOffering,
    manageSubscription,
    restore as restorePurchases,
} from '@/services/purchases';
import { useSettingsStore } from '@/stores/settings';

/**
 * A model the reader can reach, with the two numbers the picker draws.
 *
 * Both computed on the server. The app never sees a price - that is spec §19,
 * and it is what keeps OpenRouter an implementation detail rather than
 * something a stale client could turn into a display decision of its own.
 */
export type PlanModel = CloudModelOption & {
  /** Credits a typical message costs, or null when the model has no price. */
  forecastCredits: number | null;
  /** How dear this model is against the cheapest in its own plan band. */
  multiplier: number;
};

/**
 * Four states, and the first one matters for the same reason it does on the
 * account store: `unknown` is the moment before the server has answered, and
 * treating it as `none` would flash a plan carousel at somebody who is
 * already paying, on every cold open.
 */
export type SubscriptionStatus = 'unknown' | 'unavailable' | 'none' | 'active';
export type PurchaseOutcome = 'active' | 'scheduled' | 'pending' | false;

type SubscriptionState = {
  status: SubscriptionStatus;
  plan: PlanId | null;
  balance: CreditBalance;
  models: PlanModel[];
  /** The whole catalogue with each model's tier and credit estimate - what
   * the plan info sheets describe. Empty against an older server, whose
   * `/billing/me` predates it; the sheets then degrade to the counts. */
  catalogue: PlanModel[];
  /** How many models each plan reaches. From the server, because the
   * catalogue lives there and a tier can gain one without a deploy. */
  modelsByPlan: Record<PlanId, number>;
  /** The top model of the reader's own band, from the server. Kept so a
   * freshly confirmed purchase can force the selection to it - see
   * `healSelectedModel`. */
  defaultModelId: string | null;
  /** The plans on sale, in the order the server's offering lists them. */
  offering: PurchasesOffering | null;
  /** Store renewal state. Access itself remains authoritative on the server. */
  lifecycle: SubscriptionLifecycle | null;
  /** A purchase or a restore is in flight; which plan, so one card spins. */
  /** A purchase, restore, or store-management handoff is in flight. */
  busy: PlanId | 'restore' | 'manage' | null;
  /** A balance read is in flight. The meter shows it instead of REFRESH. */
  loading: boolean;
  error: string | null;
  reset: () => void;
  applyCustomerInfo: (customerInfo: CustomerInfo | null) => void;
  refresh: () => Promise<void>;
  /**
   * Take the balance the chat stream already carried.
   *
   * The metered route yields a `samwell-credits` chunk before it finishes, so
   * the number is in hand the moment a turn ends. Reading it here saves a
   * whole authenticated round trip per message - which the app was making,
   * every turn, to learn something it had already been told.
   *
   * Patches only what the chunk knows. The grant and the renewal date do not
   * move inside a month, so they are left alone rather than being invented.
   */
  applyCreditsFromTurn: (available: number) => void;
  loadOffering: () => Promise<void>;
  purchase: (packageToBuy: PurchasesPackage, plan: PlanId) => Promise<PurchaseOutcome>;
  restore: () => Promise<boolean>;
  manage: () => Promise<'opened' | 'test-store' | false>;
  redeemInsider: (code: string) => Promise<boolean>;
};

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function baseUrl(): string {
  return SAMWELL_CLOUD_BASE_URL.trim().replace(/\/+$/, '');
}

function sameLifecycle(
  current: SubscriptionLifecycle | null,
  next: SubscriptionLifecycle | null,
): boolean {
  if (current === next) return true;
  if (!current || !next) return false;
  return (
    current.plan === next.plan &&
    current.willRenew === next.willRenew &&
    current.expiresAt === next.expiresAt &&
    current.unsubscribeDetectedAt === next.unsubscribeDetectedAt &&
    current.billingIssueDetectedAt === next.billingIssueDetectedAt
  );
}

/**
 * How many times to ask the server again after a purchase, and how long to
 * wait between asks.
 *
 * The store confirms a purchase to the app before RevenueCat has finished
 * telling the server about it, so the first read can legitimately still say
 * "no plan". The webhook usually lands within a second; `readEntitlement`'s
 * own REST reconcile covers the case where it does not, but that only runs
 * when the server is asked. So the app asks a few times rather than showing
 * somebody who has just paid a carousel asking them to pay.
 */
const CONFIRM_ATTEMPTS = 6;
const CONFIRM_DELAY_MS = 1_200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let accountGeneration = 0;
let refreshInFlight: Promise<void> | null = null;

/**
 * How long to wait on Samwell Cloud before giving up.
 *
 * Without a bound, a request that never answers leaves `loading` true for the
 * life of the process: the meter spins forever and REFRESH is unreachable
 * because the spinner is standing where it used to be. Worse inside the
 * purchase confirmation loop, where one hung read stalls every attempt after
 * it and a reader who has just paid is told nothing happened.
 *
 * `AbortController` plus a timer rather than `AbortSignal.timeout`, matching
 * `services/chat-title` and its siblings - Hermes does not ship the static
 * helper.
 */
const REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Settle which model this reader is on.
 *
 * Two jobs, and they share an answer. The first is healing: a stored id that
 * is not in the plan has to go somewhere, or the panel says "Choose a model"
 * about a choice nobody was asked to make. This used to live in
 * `settings.loadCloudModels`, which read `/models` - the whole catalogue, with
 * no idea of plans - so it could settle on a model the reader had not paid
 * for. It reads the plan-scoped list now.
 *
 * The second is the first impression. `cloudModelId` starts null, and null
 * adopts the plan's own default: the top of their band, not the cheapest
 * thing they can reach. Access is cumulative, so without this an Archmaester
 * opened the app talking to a flash model and had to go and find the tier
 * they were paying for.
 *
 * An empty list means the answer is not known yet, not that the choice was
 * wrong, so nothing is touched.
 */
function healSelectedModel(
  models: PlanModel[],
  defaultModelId: string | undefined,
  options: { force?: boolean } = {},
): void {
  if (models.length === 0) return;
  const settings = useSettingsStore.getState();
  const current = settings.cloudModelId;
  if (!options.force && current !== null && models.some((model) => model.id === current)) return;

  const healed = models.some((model) => model.id === defaultModelId)
    ? defaultModelId
    : models[0]?.id;
  if (healed && healed !== current) void settings.setCloudModelId(healed);
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  status: 'unknown',
  plan: null,
  balance: NO_PLAN_BALANCE,
  models: [],
  catalogue: [],
  modelsByPlan: { maester: 0, grand_maester: 0, archmaester: 0 },
  defaultModelId: null,
  offering: null,
  lifecycle: null,
  busy: null,
  loading: false,
  error: null,

  reset: () => {
    accountGeneration += 1;
    refreshInFlight = null;
    set({
      status: 'unknown',
      plan: null,
      balance: NO_PLAN_BALANCE,
      models: [],
      defaultModelId: null,
      lifecycle: null,
      busy: null,
      loading: false,
      error: null,
    });
  },

  applyCustomerInfo: (customerInfo) => {
    const lifecycle = customerInfo ? subscriptionLifecycle(customerInfo) : null;
    if (sameLifecycle(get().lifecycle, lifecycle)) return;
    set({ lifecycle });
  },

  /**
   * Ask the server what this account may spend.
   *
   * The server is authoritative, not `CustomerInfo`: it is the thing that
   * refuses a turn, so it is the thing whose answer the app draws. The
   * store's own opinion is used to start a purchase and for nothing else.
   */
  refresh: () => {
    if (!baseUrl()) {
      set({ status: 'unavailable', error: null });
      return Promise.resolve();
    }
    if (refreshInFlight) return refreshInFlight;

    const generation = accountGeneration;
    const previousPlan = get().plan;
    set({ loading: true });
    let operation: Promise<void>;
    operation = (async () => {
      try {
        const response = await fetchWithTimeout(`${baseUrl()}/billing/me`, {
          headers: await cloudHeaders(),
        });
        if (!response.ok) throw new Error(`Samwell Cloud answered ${response.status}.`);
        const body = (await response.json()) as {
          balance: CreditBalance;
          models: PlanModel[];
          modelsByPlan?: Record<PlanId, number>;
          defaultModelId?: string;
          catalogue?: PlanModel[];
        };
        if (generation !== accountGeneration) return;
        set({
          status: body.balance.plan ? 'active' : 'none',
          plan: body.balance.plan,
          balance: body.balance,
          models: body.models ?? [],
          ...(body.modelsByPlan ? { modelsByPlan: body.modelsByPlan } : {}),
          // Absent from an older server: the info sheets then degrade to the
          // counts rather than naming models they cannot see.
          catalogue: body.catalogue ?? [],
          defaultModelId: body.defaultModelId ?? null,
          error: null,
        });
        const nextPlan = body.balance.plan;
        healSelectedModel(body.models ?? [], body.defaultModelId, {
          // This also catches a deferred downgrade when it becomes active at
          // renewal, outside the purchase call that originally scheduled it.
          force:
            previousPlan !== null &&
            nextPlan !== null &&
            previousPlan !== nextPlan,
        });
      } catch (error) {
        // The status is left alone on a failed read. A network blip is not
        // evidence that somebody's subscription has gone away, and drawing the
        // carousel over a paid account would be the worst way to be wrong.
        if (generation === accountGeneration) {
          set({ error: message(error, 'Could not check your credits.') });
        }
      } finally {
        if (generation === accountGeneration) set({ loading: false });
      }
    })().finally(() => {
      if (refreshInFlight === operation) refreshInFlight = null;
    });
    refreshInFlight = operation;
    return operation;
  },

  applyCreditsFromTurn: (available) => {
    const current = get().balance;
    const next = Math.max(0, available);
    if (current.available === next) return;
    set({ balance: { ...current, available: next, balance: next } });
  },

  loadOffering: async () => {
    if (!PURCHASES_ENABLED) {
      set({ status: 'unavailable' });
      return;
    }
    try {
      set({ offering: await getOffering(), error: null });
    } catch (error) {
      set({ error: message(error, 'Could not load the plans.') });
    }
  },

  /**
   * Buy a plan, then wait for the server to agree that it happened.
   *
   * Returns whether the reader ends up with a plan, so the caller can decide
   * what to say. A cancellation returns false and sets no error: closing the
   * sheet is a decision, and telling somebody their own choice failed is the
   * one thing this must not do.
   */
  purchase: async (packageToBuy, plan) => {
    const generation = accountGeneration;
    set({ busy: plan, error: null });
    try {
      const currentPlan = get().plan;
      const changingPlan = currentPlan !== null && plan !== currentPlan;
      const downgrading =
        currentPlan !== null && planRank(plan) < planRank(currentPlan);
      const customerInfo = await buyPackage(packageToBuy, {
        currentEntitlement:
          changingPlan
            ? CREDIT_PLANS[currentPlan].entitlement
            : undefined,
        deferred: downgrading,
      });
      if (generation !== accountGeneration) return false;
      get().applyCustomerInfo(customerInfo);

      if (downgrading) {
        await get().refresh();
        if (generation !== accountGeneration) return false;
        if (get().plan === plan) {
          healSelectedModel(get().models, get().defaultModelId ?? undefined, { force: true });
          return 'active';
        }
        return 'scheduled';
      }

      for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt += 1) {
        await get().refresh();
        if (generation !== accountGeneration) return false;
        const confirmedPlan = get().plan;
        if (confirmedPlan && planRank(confirmedPlan) >= planRank(plan)) {
          // Forced: a freshly bought plan overrides whatever was selected
          // before, even a cheaper model still valid under the new, wider band.
          healSelectedModel(get().models, get().defaultModelId ?? undefined, { force: true });
          return 'active';
        }
        await sleep(CONFIRM_DELAY_MS);
      }
      /*
       * Paid, but the server has not seen it yet. Not an error in the
       * reader's sense - the money moved and the plan is real - so this says
       * what is true and what to do, rather than implying the purchase
       * failed and inviting them to buy it twice.
       */
      if (generation === accountGeneration) {
        set({
          error: 'Payment went through. Your credits will appear shortly; pull to refresh.',
        });
      }
      return 'pending';
    } catch (error) {
      if (error instanceof PurchaseCancelled) return false;
      if (generation === accountGeneration) {
        set({ error: message(error, 'Could not complete the purchase.') });
      }
      return false;
    } finally {
      if (generation === accountGeneration) set({ busy: null });
    }
  },

  restore: async () => {
    const generation = accountGeneration;
    set({ busy: 'restore', error: null });
    try {
      const customerInfo = await restorePurchases();
      if (generation !== accountGeneration) return false;
      get().applyCustomerInfo(customerInfo);
      await get().refresh();
      if (generation !== accountGeneration) return false;
      const restored = Boolean(get().plan);
      if (!restored) set({ error: 'No previous subscription found for this account.' });
      return restored;
    } catch (error) {
      if (generation === accountGeneration) {
        set({ error: message(error, 'Could not restore your purchases.') });
      }
      return false;
    } finally {
      if (generation === accountGeneration) set({ busy: null });
    }
  },

  manage: async () => {
    set({ busy: 'manage', error: null });
    try {
      return await manageSubscription();
    } catch (error) {
      set({ error: message(error, 'Could not open subscription management.') });
      return false;
    } finally {
      set({ busy: null });
    }
  },

  redeemInsider: async (code) => {
    set({ busy: 'restore', error: null });
    try {
      const response = await fetchWithTimeout(`${baseUrl()}/billing/insider/redeem`, {
        method: 'POST',
        headers: await cloudJsonHeaders(),
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? 'That code could not be redeemed.');
      }
      await get().refresh();
      return true;
    } catch (error) {
      set({ error: message(error, 'That code could not be redeemed.') });
      return false;
    } finally {
      set({ busy: null });
    }
  },
}));

/**
 * Whether this account can talk to cloud Samwell, without subscribing to the
 * balance that moves under it.
 *
 * The mirror of `useSignedIn()`, and it exists for the same reason: the
 * readiness hook and the chat surfaces want one boolean, and the whole-store
 * form would re-render a chat screen every time a credit was spent.
 */
export function useHasPlan(): boolean {
  return useSubscriptionStore((s) => s.status === 'active');
}

/** The credits meter's own slice, for the same reason. */
export function useCreditBalance(): CreditBalance {
  return useSubscriptionStore((s) => s.balance);
}
