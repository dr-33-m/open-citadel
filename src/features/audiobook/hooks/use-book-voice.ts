import React from 'react';
import type { PlanId } from 'samwell-shared';

import { CAN_SELL_PLANS } from '@/features/billing/utils/can-sell';
import { queryClient } from '@/lib/query-client';
import { billingKeys } from '@/query-manager/billing/keys';
import { useCloudVoicePane } from '@/features/tts/hooks/use-cloud-voice-pane';
import { plansForMaker } from '@/features/tts/utils/cloud-voices';
import { landOnCloud } from '@/features/tts/hooks/use-voice-source';
import { CLOUD_PLANS_LINE } from '@/features/tts/utils/voice-copy';
import { followBookVoice } from '@/services/audiobook';
import { useSubscriptionStore } from '@/stores/subscription';

type Offer = ReturnType<typeof plansForMaker>;

/**
 * The book's voice, chosen in the player with the reader's own cloud pane
 * (`useCloudVoicePane`), so a choice here is the reader's voice too. Trying
 * voices costs nothing; the book carries on in the new one once the sheet is
 * closed, from the sentence being heard, so browsing never pays for a
 * sentence in every voice passed through. A locked voice box offers the
 * plans that open it, in place.
 */
export function useBookVoice({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const held = useSubscriptionStore((s) => (s.status === 'active' ? s.plan : null));
  const [offer, setOffer] = React.useState<Offer | null>(null);
  const [offering, setOffering] = React.useState(false);
  const openPlansFor = React.useCallback(
    (maker: string, needed: PlanId) => {
      if (!CAN_SELL_PLANS) return;
      setOffer(plansForMaker(maker, needed, held));
      setOffering(true);
    },
    [held],
  );
  const pane = useCloudVoicePane({ onLockedMaker: openPlansFor, sample: null });

  const close = React.useCallback(() => {
    onClose();
    void followBookVoice();
  }, [onClose]);

  return {
    sheet: { visible, onClose: close },
    /** No voice box to show: the voices could not be read from the server. */
    unavailable: pane.boxes.length === 0,
    retry: () => void queryClient.invalidateQueries({ queryKey: billingKeys.planPreview() }),
    voices: {
      selection: pane.selection,
      boxes: pane.boxes,
      contents: pane.contents,
      info: pane.info,
      figuresLabel: pane.figuresLabel,
      sampleLabel: pane.sampleLabel,
      onMaker: pane.chooseMaker,
      onModel: pane.chooseModel,
      onVoice: pane.chooseVoice,
    },
    plans: {
      visible: offering,
      onClose: () => setOffering(false),
      line: offer?.line ?? CLOUD_PLANS_LINE,
      plans: offer?.plans,
      initialPlanId: offer?.initialPlanId,
      infoOpensOn: 'voices' as const,
      onActivated: () => {
        const bought = useSubscriptionStore.getState().plan;
        if (bought) landOnCloud(bought);
      },
    },
  };
}

export type BookVoiceState = ReturnType<typeof useBookVoice>;
