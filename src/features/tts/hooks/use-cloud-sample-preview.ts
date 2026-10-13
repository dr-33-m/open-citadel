import { useCallback, useEffect, useRef, useState } from 'react';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { sampleUrl } from '@/services/cloud-tts/request';

/** Longer than any sample takes to start. Past it the sample is said to be unavailable. */
const START_TIMEOUT_MS = 8_000;

/**
 * Plays a cloud voice's free sample.
 *
 * The samples are files the server made once (`voice-samples.ts`), streamed
 * by `expo-audio` from their URL: no sign-in, no metering, so trying every
 * voice in the list never moves a balance. The same shape as
 * `useVoicePreview`, so the voice list cannot tell which kind is behind it.
 */
export function useCloudSamplePreview(modelId: string | null) {
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [audible, setAudible] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPlayer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    playerRef.current?.remove();
    playerRef.current = null;
  }, []);

  const stop = useCallback(() => {
    stopPlayer();
    setPreviewingVoice(null);
  }, [stopPlayer]);

  const preview = useCallback(
    async (voice: string) => {
      stopPlayer();
      setPreviewError(null);
      setAudible(false);
      const url = modelId ? sampleUrl(modelId, voice) : null;
      if (!url) {
        setPreviewError('Samples are not available in this build.');
        return;
      }
      // Answered in the press's own frame: the row shows it is working.
      setPreviewingVoice(voice);
      try {
        await setAudioModeAsync({ playsInSilentMode: true, shouldRouteThroughEarpiece: false, interruptionMode: 'doNotMix' });
      } catch {
        // Plays with the mode it has.
      }
      const player = createAudioPlayer(url);
      playerRef.current = player;
      const failed = () => {
        if (playerRef.current !== player) return;
        stopPlayer();
        setPreviewingVoice(null);
        setPreviewError('That sample is not available right now.');
      };
      timerRef.current = setTimeout(failed, START_TIMEOUT_MS);
      player.addListener('playbackStatusUpdate', (status) => {
        if (playerRef.current !== player) return;
        if (status.currentTime > 0) {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = null;
          setAudible(true);
        }
        if (status.didJustFinish) {
          stopPlayer();
          setPreviewingVoice(null);
        }
      });
      player.play();
    },
    [modelId, stopPlayer],
  );

  useEffect(() => stopPlayer, [stopPlayer]);

  return {
    previewingVoice,
    preparingVoice: audible ? null : previewingVoice,
    previewError,
    preview,
    stop,
  };
}
