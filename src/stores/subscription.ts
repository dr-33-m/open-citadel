import { create } from 'zustand';
import {
  NO_PLAN_BALANCE,
  type CloudModelOption,
  type CreditBalance,
  type PlanId,
} from 'samwell-shared';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import { PURCHASES_ENABLED } from '@/constants/revenuecat';
import { SAMWELL_CLOUD_BASE_URL } from '@/constants/samwell-cloud';
import { cloudHeaders, cloudJsonHeaders } from '@/services/cloud-identity';
import { useSettingsStore } from '@/stores/settings';
import {
  PurchaseCancelled,
  getOffering,
  purchase as buyPackage,
  restore as restorePurchases,
} from '@/services/purchases';

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

type SubscriptionState = {
  status: SubscriptionStatus;
  plan: PlanId | null;
  balance: CreditBalance;
  models: PlanModel[];
  /** How many models each plan reaches. From the server, because the
   * catalogue lives there and a tier can gain one without a deploy. */
  modelsByPlan: Record<PlanId, number>;
  /** The plans on sale, in the order the server's offering lists them. */
  offering: PurchasesOffering | null;
  /** A purchase or a restore is in flight; which plan, so one card spins. */
  busy: PlanId | 'restore' | null;
  /** A balance read is in flight. The meter shows it instead of REFRESH. */
  loading: boolean;
  error: string | null;
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
  purchase: (packageToBuy: PurchasesPackage, plan: PlanId) => Promise<boolean>;
  restore: () => Promise<boolean>;
  redeemInsider: (code: string) => Promise<boolean>;
};

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function baseUrl(): string {
  return SAMWELL_CLOUD_BASE_URL.trim().replace(/\/+$/, '');
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
 * Keep the chosen model inside what the plan can actually reach.
 *
 * This decision used to live in `settings.loadCloudModels`, which read
 * `/models` - the whole catalogue, with no idea of plans. That is now the
 * wrong list to heal against: it would happily settle on a model the reader
 * has not paid for, and the picker (which lists only their plan's) would then
 * show "Choose a model" about a choice nobody was asked to make. Same rule as
 * before, moved to where the plan-scoped list is.
 *
 * Only heals when the stored id is genuinely absent. An empty list means the
 * answer is not known yet, not that the choice was wrong.
 */
function healSelectedModel(models: PlanModel[], defaultModelId: string | undefined): void {
  if (models.length === 0) return;
  const settings = useSettingsStore.getState();
  if (models.some((model) => model.id === settings.cloudModelId)) return;

  const healed = models.some((model) => model.id === defaultModelId)
    ? defaultModelId
    : models[0]?.id;
  if (healed && healed !== settings.cloudModelId) void settings.setCloudModelId(healed);
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  status: 'unknown',
  plan: null,
  balance: NO_PLAN_BALANCE,
  models: [],
  modelsByPlan: { maester: 0, grand_maester: 0, archmaester: 0 },
  offering: null,
  busy: null,
  loading: false,
  error: null,

  /**
   * Ask the server what this account may spend.
   *
   * The server is authoritative, not `CustomerInfo`: it is the thing that
   * refuses a turn, so it is the thing whose answer the app draws. The
   * store's own opinion is used to start a purchase and for nothing else.
   */
  refresh: async () => {
    if (!baseUrl()) {
      set({ status: 'unavailable', error: null });
      return;
    }
    set({ loading: true });
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
      };
      set({
        status: body.balance.plan ? 'active' : 'none',
        plan: body.balance.plan,
        balance: body.balance,
        models: body.models ?? [],
        ...(body.modelsByPlan ? { modelsByPlan: body.modelsByPlan } : {}),
        error: null,
      });
      healSelectedModel(body.models ?? [], body.defaultModelId);
    } catch (error) {
      // The status is left alone on a failed read. A network blip is not
      // evidence that somebody's subscription has gone away, and drawing the
      // carousel over a paid account would be the worst way to be wrong.
      set({ error: message(error, 'Could not check your credits.') });
    } finally {
      set({ loading: false });
    }
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
    set({ busy: plan, error: null });
    try {
      await buyPackage(packageToBuy);
      for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt += 1) {
        await get().refresh();
        if (get().plan) return true;
        await sleep(CONFIRM_DELAY_MS);
      }
      /*
       * Paid, but the server has not seen it yet. Not an error in the
       * reader's sense - the money moved and the plan is real - so this says
       * what is true and what to do, rather than implying the purchase
       * failed and inviting them to buy it twice.
       */
      set({
        error: 'Payment went through. Your credits will appear shortly; pull to refresh.',
      });
      return false;
    } catch (error) {
      if (error instanceof PurchaseCancelled) return false;
      set({ error: message(error, 'Could not complete the purchase.') });
      return false;
    } finally {
      set({ busy: null });
    }
  },

  restore: async () => {
    set({ busy: 'restore', error: null });
    try {
      await restorePurchases();
      await get().refresh();
      const restored = Boolean(get().plan);
      if (!restored) set({ error: 'No previous subscription found for this account.' });
      return restored;
    } catch (error) {
      set({ error: message(error, 'Could not restore your purchases.') });
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
