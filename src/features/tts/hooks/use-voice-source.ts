import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CREDIT_PLANS, PLANS, planRank, type CreditPlan, type PlanId } from 'samwell-shared';

import { CAN_SELL_PLANS } from '@/features/billing/utils/can-sell';
import { cloudVoiceForPlan, planShortName } from '@/features/tts/utils/cloud-voices';
import {
  CLOUD_PLANS_ELSEWHERE,
  CLOUD_PLANS_LINE,
  CLOUD_VOICES_SOON,
  CLOUD_WITH_A_PLAN,
  type VoiceSource,
} from '@/features/tts/utils/voice-copy';
import { createCloudVoicesQueryOptions } from '@/query-manager/cloud-voices';
import { queryClient } from '@/lib/query-client';
import { billingKeys } from '@/query-manager/billing/keys';
import type { PlanPreview } from '@/services/billing-plans';
import { useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';

type PlansOffer = { line: string; plans: CreditPlan[]; initialPlanId: PlanId | undefined };

/** Read when a plan has just been bought, so the answer is the one in hand now, not the one at render. */
function landOnCloud(plan: PlanId): void {
  const figures = queryClient.getQueryData<PlanPreview>(billingKeys.planPreview())?.voices;
  const state = useSettingsStore.getState();
  const key = cloudVoiceForPlan(figures, plan, state.ttsCloudVoice);
  if (key) void state.setTtsVoice(key);
}

/**
 * The two source cards and the wall between them.
 *
 * Choosing Cloud with a plan goes straight to the cloud voice last chosen
 * (or the plan's default). Without one, it raises the plans sheet over the
 * panel, wherever the panel is: buying closes the sheet with Cloud chosen,
 * dismissing leaves On-device as it was. Nobody is sent to Settings to buy.
 * Where this build cannot sell plans, the card stays shut and says why.
 *
 * The plans sheet also answers a locked maker (`openPlansFor`), offering only
 * the plans that open it, and above the plan already held.
 *
 * A plan that ends while a cloud voice is chosen puts the voice back on the
 * phone, and the card returns to WITH A PLAN.
 */
export function useVoiceSource({ source, selectDevice }: { source: VoiceSource; selectDevice: () => void }) {
  const query = useQuery(createCloudVoicesQueryOptions());
  const status = useSubscriptionStore((s) => s.status);
  const plan = useSubscriptionStore((s) => (s.status === 'active' ? s.plan : null));
  // The offer stays after closing, so the sheet keeps its words as it leaves.
  const [offer, setOffer] = useState<PlansOffer | null>(null);
  const [offering, setOffering] = useState(false);

  // An older server answers with no voices at all: the card stays shut.
  const noVoices = query.data === null;
  const cannotBuy = !plan && !CAN_SELL_PLANS;
  const cloudStatus = noVoices ? CLOUD_VOICES_SOON : plan ? planShortName(plan) : status === 'unknown' ? '' : CLOUD_WITH_A_PLAN;

  useEffect(() => {
    if (status === 'none' && source === 'cloud') selectDevice();
  }, [status, source, selectDevice]);

  const selectCloud = useCallback(() => {
    if (plan) landOnCloud(plan);
    else if (CAN_SELL_PLANS) {
      setOffer({ line: CLOUD_PLANS_LINE, plans: PLANS, initialPlanId: 'maester' });
      setOffering(true);
    }
  }, [plan]);

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
    cloudLocked: noVoices || cannotBuy,
    cloudStatus,
    note: cannotBuy && !noVoices ? CLOUD_PLANS_ELSEWHERE : null,
    selectCloud,
    openPlansFor,
    plans: {
      visible: offering,
      onClose: closePlans,
      line: offer?.line ?? CLOUD_PLANS_LINE,
      plans: offer?.plans,
      initialPlanId: offer?.initialPlanId,
      onActivated,
    },
  };
}
