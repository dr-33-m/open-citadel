/**
 * The ways out of a cloud voice that cannot go on, wired to the reader.
 *
 * The cloud bridge holds the sentence it could not read and has paused the
 * book on it (`use-cloud-voice-bridge.ts`). From there:
 *
 *  - Continue on-device goes back to the voice that was reading on the phone
 *    before, at that same sentence. An Enhanced voice answers the held
 *    request itself, so not a word is skipped or repeated. A Lite voice runs
 *    in Readium's native engine, which JS cannot hand a request to; failing
 *    the held request is exactly the signal that makes Android's engine
 *    restart on the phone's own voice from that sentence. The cloud voice is
 *    kept as the remembered cloud choice for next time.
 *  - Try again asks for the sentence once more and carries on.
 *  - Upgrade, or See plans, raises the plans sheet over this one; a plan
 *    bought there tries the sentence again with the room it now has.
 *  - Dragging the sheet away stops reading, so nothing is left waiting on a
 *    sentence nobody will answer. Play starts it again.
 */
import { useCallback, useMemo, useState } from 'react';

import type { ReadiumViewRef } from '@dr33m/react-native-readium';
import { PLANS, planRank, type CreditPlan } from 'samwell-shared';

import type { useReadAloudBridge } from '@/features/reader/hooks/use-read-aloud-bridge';
import { CAN_SELL_PLANS } from '@/features/billing/utils/can-sell';
import { cloudFailureCopy, type FailureAction, type FailureCopy } from '@/features/tts/utils/cloud-failure';
import { AI_VOICES_SUPPORTED, DEFAULT_VOICE, DEVICE_VOICE, voiceMode } from '@/services/device-tts/catalogue';
import { lastDeviceVoice, useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';

type Bridge = ReturnType<typeof useReadAloudBridge>;

export function useCloudVoiceFailure(readerRef: React.RefObject<ReadiumViewRef | null>, bridge: Bridge) {
  const { cloud, device } = bridge;
  const { held, retry, release } = cloud;
  const { onSynthesisRequest: answerOnDevice } = device;
  const plan = useSubscriptionStore((s) => (s.status === 'active' ? s.plan : null));
  const [plansVisible, setPlansVisible] = useState(false);
  // The copy outlives the failure by the length of the sheet's exit, so the
  // words do not vanish while it is still sliding away. Adjusted during
  // render rather than in an effect (as `components/ui/sheet` does), so the
  // sheet rises with its words in the same commit.
  const [copy, setCopy] = useState<FailureCopy | null>(null);
  const [copiedFrom, setCopiedFrom] = useState(held);

  const offered: CreditPlan[] = useMemo(
    () => (plan ? PLANS.filter((candidate) => planRank(candidate.id) > planRank(plan)) : PLANS),
    [plan],
  );

  if (held && held !== copiedFrom) {
    setCopiedFrom(held);
    setCopy(cloudFailureCopy(held.failure, { canSell: CAN_SELL_PLANS, canUpgrade: offered.length > 0 }));
  }

  const continueOnDevice = useCallback(() => {
    const request = release();
    if (!request) return;
    const state = useSettingsStore.getState();
    const back = lastDeviceVoice(state);
    const voice = back.voice ?? (AI_VOICES_SUPPORTED ? DEFAULT_VOICE : DEVICE_VOICE);
    // The store hears first and the database after, so the answer below
    // already reads the on-device voice.
    void state.setTtsVoice(voice, back.language);
    if (voiceMode(voice) === 'ai') {
      answerOnDevice(request);
      readerRef.current?.ttsResume();
    } else {
      readerRef.current?.ttsSynthesisFailed(request.requestId, 'Carrying on with the phone voice.');
    }
  }, [answerOnDevice, readerRef, release]);

  const onAction = useCallback(
    (action: FailureAction) => {
      if (action === 'continue') continueOnDevice();
      else if (action === 'retry') retry();
      else setPlansVisible(true);
    },
    [continueOnDevice, retry],
  );

  const onClose = useCallback(() => {
    if (!release()) return;
    readerRef.current?.ttsStop();
  }, [readerRef, release]);

  const closePlans = useCallback(() => setPlansVisible(false), []);

  return {
    sheet: { visible: held !== null, copy, onAction, onClose },
    plans: {
      visible: plansVisible,
      onClose: closePlans,
      line: 'Cloud voices come with every plan. Pick one and the book carries on.',
      plans: offered,
      initialPlanId: offered[0]?.id,
      onActivated: retry,
    },
  };
}
