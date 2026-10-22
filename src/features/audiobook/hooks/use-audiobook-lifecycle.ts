import React from 'react';
import { AppState } from 'react-native';

import { RotateCcw } from '@/components/icons';
import { showToast } from '@/components/toast/toast-provider';
import { failureToast } from '@/features/audiobook/utils/failure-toast';
import { CAN_SELL_PLANS } from '@/features/billing/utils/can-sell';
import { landOnCloud } from '@/features/tts/hooks/use-voice-source';
import { restoreBook, retryBook } from '@/services/audiobook';
import { useAudiobook } from '@/stores/audiobook';
import { useSubscriptionStore } from '@/stores/subscription';
import { haptics } from '@/utils/haptics';

const TOAST = 'audiobook-failure';

/**
 * The audiobook's part of the app rather than of any screen: the book back in
 * the mini player after a restart, and what the listener is told when the
 * voice stops making it. A failure is a toast (keyed, so a second writes over
 * the first) with its way out; one that a plan answers raises the plans in
 * place, only while the app is in front: a book stopped on a locked phone
 * waits for the listener to come back.
 *
 * Returns the plans sheet's props, for `AudiobookWalls` to draw.
 */
export function useAudiobookLifecycle(ready: boolean) {
  const failure = useAudiobook((s) => s.failure);
  const plansAsked = useAudiobook((s) => s.plansAsked);
  const [selling, setSelling] = React.useState(false);
  // Play pressed with no plan that reaches a cloud voice: the plans, in place.
  const [answered, setAnswered] = React.useState(plansAsked);
  if (answered !== plansAsked) {
    setAnswered(plansAsked);
    if (CAN_SELL_PLANS) setSelling(true);
  }

  React.useEffect(() => {
    if (ready) void restoreBook();
  }, [ready]);

  React.useEffect(() => {
    if (!failure) return;
    const { message, wayOut } = failureToast(failure, CAN_SELL_PLANS);
    const tell = () => {
      haptics.warn();
      if (wayOut === 'plans') setSelling(true);
      showToast({
        key: TOAST,
        message,
        ...(wayOut === 'retry' ? { actionIcon: RotateCcw, actionLabel: 'Try again', onActionPress: retryBook } : {}),
      });
    };
    if (AppState.currentState === 'active') {
      tell();
      return;
    }
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      sub.remove();
      if (useAudiobook.getState().failure === failure) tell();
    });
    return () => sub.remove();
  }, [failure]);

  return {
    visible: selling,
    onClose: () => setSelling(false),
    line: 'Listening to books comes with every plan.',
    infoOpensOn: 'voices' as const,
    onActivated: () => {
      const bought = useSubscriptionStore.getState().plan;
      if (bought) landOnCloud(bought);
      retryBook();
    },
  };
}
