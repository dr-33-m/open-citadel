import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CREDIT_PLANS, PLANS, planRank, type CreditPlan, type PlanId } from 'samwell-shared';

import { CAN_SELL_PLANS } from '@/features/billing/utils/can-sell';
import { cloudPaneView, cloudVoiceForPlan, planShortName } from '@/features/tts/utils/cloud-voices';
import {
  CLOUD_PLANS_ELSEWHERE,
  CLOUD_PLANS_LINE,
  CLOUD_VOICES_SOON,
  CLOUD_WITH_A_PLAN,
  type VoiceSource,
} from '@/features/tts/utils/voice-copy';
import { useCloudIdentity } from '@/hooks/use-cloud-identity';
import { createCloudVoicesQueryOptions } from '@/query-manager/cloud-voices';
import { queryClient } from '@/lib/query-client';
import { billingKeys } from '@/query-manager/billing/keys';
import type { PlanPreview } from '@/services/billing-plans';
import { useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';

type PlansOffer = { line: string; plans: CreditPlan[]; initialPlanId: PlanId | undefined };

/**
 * A plan whose voices are being heard before it is bought. `key` is the voice
 * chosen while sampling, held here and nowhere else; `open` is whether the
 * samples or the plans are on show, the plan kept either way so its pane does
 * not empty as it leaves.
 */
type Sample = { plan: PlanId | null; key: string | null; open: boolean };
const NO_SAMPLE: Sample = { plan: null, key: null, open: false };

/**
 * Put the reading voice on the cloud voice this plan reads in: the one
 * remembered when the plan reaches it, the plan's default otherwise. Read
 * when a plan has just been bought, so the answer is the one in hand now,
 * not the one at render. Also where a plan bought mid-book lands
 * (`use-cloud-voice-failure`), since the plan may not reach the voice that
 * was reading.
 *
 * `preferred` is a voice the reader was sampling when they bought: it is
 * where they land when the plan reaches it.
 */
export function landOnCloud(plan: PlanId, preferred?: string | null): void {
  const figures = queryClient.getQueryData<PlanPreview>(billingKeys.planPreview())?.voices;
  const state = useSettingsStore.getState();
  const key = cloudVoiceForPlan(figures, plan, preferred ?? state.ttsCloudVoice);
  if (key) void state.setTtsVoice(key);
}

/**
 * The two source cards and what sits under the Cloud one.
 *
 * Choosing Cloud with a plan goes straight to the cloud voice last chosen
 * (or the plan's default). Without one the card can still be chosen, as
 * Samwell's own Cloud card can: the plans are then drawn where the voices
 * would be (`pane`), and buying one there turns them into the voices. Nobody
 * is sent to Settings to buy. Where this build cannot sell plans, the card
 * stays shut and says why.
 *
 * Looking is not choosing: the reading voice stays on the phone until a plan
 * is held, so `shown` (the card outlined and the pane under it) is this
 * panel's own, and follows the saved voice whenever that changes.
 *
 * Nor is sampling. From the plans a reader can hear a plan's voices first
 * (`startSampling`): the voices pane is then drawn as that plan would have
 * it, and what is chosen in it is kept in this hook's state (`sample`), never
 * in the settings. So nothing a reader does while sampling can leave a cloud
 * voice as the reading voice, whatever they do next: close the panel, open a
 * book, quit. Buying the plan lands them on the voice they were sampling.
 *
 * A plans sheet still answers a locked voice box (`openPlansFor`), offering
 * only the plans that open it, and above the plan already held.
 *
 * A plan that ends while a cloud voice is chosen puts the voice back on the
 * phone, and the card returns to WITH A PLAN.
 */
export function useVoiceSource({ source, selectDevice }: { source: VoiceSource; selectDevice: () => void }) {
  const query = useQuery(createCloudVoicesQueryOptions());
  const status = useSubscriptionStore((s) => s.status);
  const plan = useSubscriptionStore((s) => (s.status === 'active' ? s.plan : null));
  const refresh = useSubscriptionStore((s) => s.refresh);
  const identity = useCloudIdentity().kind;
  // The source on show. It follows the saved voice, set while rendering so
  // the cards and the pane get it in the same render as the voice.
  const [shown, setShown] = useState(source);
  const [followed, setFollowed] = useState(source);
  if (followed !== source) {
    setFollowed(source);
    setShown(source);
  }
  const [sample, setSample] = useState(NO_SAMPLE);
  // A cloud voice is reading, so a plan is held: there is nothing left to sample.
  if (source === 'cloud' && sample !== NO_SAMPLE) setSample(NO_SAMPLE);
  // The offer stays after closing, so the sheet keeps its words as it leaves.
  const [offer, setOffer] = useState<PlansOffer | null>(null);
  const [offering, setOffering] = useState(false);

  // An older server answers with no voices at all: the card stays shut.
  const noVoices = query.data === null;
  const cannotBuy = !plan && !CAN_SELL_PLANS;
  const reader = {
    status,
    identity: identity === 'account' || identity === 'guest' ? ('held' as const) : identity,
    canSell: CAN_SELL_PLANS,
  };
  // The plans are on sale to this reader, whether or not they are on show.
  const selling = cloudPaneView(reader) === 'plans';
  const sampled = selling ? sample.plan : null;
  const pane = cloudPaneView({ ...reader, sampling: sampled !== null && sample.open });
  // Nothing at its foot while the plan is still being asked about.
  const cloudStatus = noVoices ? CLOUD_VOICES_SOON : plan ? planShortName(plan) : pane === 'checking' ? '' : CLOUD_WITH_A_PLAN;

  useEffect(() => {
    if (status === 'none' && source === 'cloud') selectDevice();
  }, [status, source, selectDevice]);

  // A plan arriving while the plans are on show (bought there, restored, or
  // confirmed a moment late) is what was being waited for: the voice goes to
  // the cloud. Looking at Cloud with a plan in hand means nothing else.
  useEffect(() => {
    if (plan && shown === 'cloud' && source === 'device') landOnCloud(plan, sample.key);
  }, [plan, shown, source, sample.key]);

  const selectCloud = useCallback(() => {
    if (plan) landOnCloud(plan);
    else if (CAN_SELL_PLANS) setShown('cloud');
  }, [plan]);

  const showDevice = useCallback(() => {
    setShown('device');
    selectDevice();
  }, [selectDevice]);

  const retry = useCallback(() => void refresh(), [refresh]);

  /** Hear a plan's voices. A different plan starts on its own default voice. */
  const startSampling = useCallback((next: PlanId) => {
    setSample((before) => ({ plan: next, key: before.plan === next ? before.key : null, open: true }));
  }, []);
  /** Back to the plans. The plan sampled stays in hand, so its pane leaves whole. */
  const stopSampling = useCallback(() => setSample((before) => ({ ...before, open: false })), []);
  const pickSample = useCallback((key: string) => setSample((before) => ({ ...before, key })), []);

  const openPlansFor = useCallback(
    (maker: string, needed: PlanId) => {
      if (!CAN_SELL_PLANS) return;
      const plans = PLANS.filter(
        (candidate) => planRank(candidate.id) >= planRank(needed) && (!plan || planRank(candidate.id) > planRank(plan)),
      );
      setOffer({ line: `${maker} voices come with ${CREDIT_PLANS[needed].label}.`, plans, initialPlanId: needed });
      setOffering(true);
    },
    [plan],
  );

  const onActivated = useCallback(() => {
    const bought = useSubscriptionStore.getState().plan;
    if (bought) landOnCloud(bought);
  }, []);

  const closePlans = useCallback(() => setOffering(false), []);

  return {
    shown,
    pane,
    selling,
    /** The plan being sampled and the voice chosen in it, for the voices pane to draw from. */
    sample: sampled ? { plan: sampled, key: sample.key, onPick: pickSample } : null,
    startSampling,
    stopSampling,
    cloudLocked: noVoices || cannotBuy,
    cloudStatus,
    note: cannotBuy && !noVoices ? CLOUD_PLANS_ELSEWHERE : null,
    selectDevice: showDevice,
    selectCloud,
    retry,
    openPlansFor,
    plans: {
      visible: offering,
      onClose: closePlans,
      line: offer?.line ?? CLOUD_PLANS_LINE,
      plans: offer?.plans,
      initialPlanId: offer?.initialPlanId,
      infoOpensOn: 'voices' as const,
      onActivated,
    },
  };
}
