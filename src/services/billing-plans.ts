import type { PlanId, VoiceFigures } from 'samwell-shared';

import { SAMWELL_CLOUD_BASE_URL } from '@/constants/samwell-cloud';
import type { PlanModel } from '@/stores/subscription';

/** What the plan cards say, from a route that asks for nobody. */
export type PlanPreview = {
  /** How many models each plan opens up. Absent from an older server. */
  modelsByPlan: Record<PlanId, number> | null;
  /** Every model with its tier and credit estimate, for the info sheets. */
  catalogue: PlanModel[];
  /**
   * The cloud reading voices: each with its maker, its voices, Neurons a
   * chapter and hours on each plan that reaches it. Null from an older
   * server, which the voice pane reads as "cloud voices are not open here".
   */
  voices: VoiceFigures | null;
};

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * `/billing/plans`: the plan cards' own numbers, with no account behind them.
 *
 * The cards have to be readable before anyone signs in - App Review reads a
 * price list behind a sign-in wall as registration required in order to buy
 * - and the counts live on the server because the catalogue does. Priced
 * against the entry band, which is also the band of anybody shown the plans.
 */
export async function fetchPlanPreview(signal?: AbortSignal): Promise<PlanPreview> {
  const base = SAMWELL_CLOUD_BASE_URL.trim().replace(/\/+$/, '');
  if (!base) throw new Error('Samwell Cloud is not configured for this build.');
  // A controller and a timer, as everywhere here: Hermes has neither
  // `AbortSignal.timeout` nor `AbortSignal.any`.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  let response: Response;
  try {
    response = await fetch(`${base}/billing/plans`, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
  if (!response.ok) throw new Error(`Samwell Cloud answered ${response.status}.`);
  const body = (await response.json()) as {
    modelsByPlan?: Record<PlanId, number>;
    catalogue?: PlanModel[];
    voices?: VoiceFigures;
  };
  return {
    modelsByPlan: body.modelsByPlan ?? null,
    catalogue: body.catalogue ?? [],
    voices: body.voices ?? null,
  };
}
