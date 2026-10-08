/**
 * The one answerer Readium's native engine talks to, whichever voice reads.
 *
 * The engine asks JS for every sentence and does not know which voice is
 * behind it (`readerVoiceId` starts it with none for Supertonic and cloud
 * voices alike). This reads the setting at the moment of each request and
 * hands it to the cloud session or the on-device synthesizer, so switching
 * between them while a book is open needs no restart: the next sentence is
 * simply answered by the other one.
 */
import { useCallback } from 'react';

import type { ReadiumViewRef, TTSSynthesisRequest } from '@dr33m/react-native-readium';

import { useCloudVoiceBridge } from '@/features/reader/hooks/use-cloud-voice-bridge';
import { useKokoroTtsBridge } from '@/features/reader/hooks/use-kokoro-tts-bridge';
import { isCloudVoice } from '@/services/device-tts/catalogue';
import { useSettingsStore } from '@/stores/settings';

export function useReadAloudBridge(readerRef: React.RefObject<ReadiumViewRef | null>, bookId: string | undefined) {
  const device = useKokoroTtsBridge(readerRef);
  const cloud = useCloudVoiceBridge(readerRef, bookId);
  // The stable functions, not the objects around them, so the handlers handed
  // to the native view keep their identity across this screen's renders.
  const { onSynthesisRequest: deviceRequest, onSynthesisCancel: deviceCancel } = device;
  const { request: cloudRequest, cancel: cloudCancel, utterance: cloudUtterance } = cloud;

  const onSynthesisRequest = useCallback(
    (request: TTSSynthesisRequest) => {
      if (isCloudVoice(useSettingsStore.getState().ttsVoice)) cloudRequest(request);
      else deviceRequest(request);
    },
    [cloudRequest, deviceRequest],
  );

  const onSynthesisCancel = useCallback(
    (requestId: string) => {
      cloudCancel(requestId);
      deviceCancel();
    },
    [cloudCancel, deviceCancel],
  );

  /** Feeds the cloud voice's lookahead from each utterance Readium moves to. */
  const onUtterance = useCallback(
    (after: string | null | undefined) => {
      if (isCloudVoice(useSettingsStore.getState().ttsVoice)) cloudUtterance(after);
    },
    [cloudUtterance],
  );

  return { onSynthesisRequest, onSynthesisCancel, onUtterance, device, cloud };
}
