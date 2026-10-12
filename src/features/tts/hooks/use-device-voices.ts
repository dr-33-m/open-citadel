import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createDeviceVoicesQueryOptions } from '@/query-manager/device-voices';
import { deviceSpeech } from '@/services/device-tts/speech';
import { deviceVoiceRows, type DeviceVoice } from '@/utils/device-voices';

const PREVIEW_PHRASE = 'Hello, this is a preview of this voice.';
const NO_VOICES: DeviceVoice[] = [];

/**
 * The phone's own text-to-speech voices: the cached list, its rows for the
 * picker, and previewing one.
 *
 * Owns no persistence: the picker hands the choice to whoever mounts it.
 *
 * `preview` only ever starts a voice, and keeps one identity. Pressing the
 * speaker that is playing stops it, which is `useVoiceListPicker`'s to
 * decide, the same for every kind of voice. It used to be decided here too,
 * from `previewing`, which remade the handler on every start and end and so
 * redrew all of the list's rows each time.
 */
export function useDeviceVoices() {
  const { data, isPending } = useQuery(createDeviceVoicesQueryOptions());
  const voices = data ?? NO_VOICES;
  // Nothing to load in a build without expo-speech, so it never shows a skeleton.
  const loading = isPending && deviceSpeech() !== null;

  const [previewing, setPreviewing] = useState<string | null>(null);
  // Bumped on every preview/stop so a stale `onDone` cannot clear a newer preview.
  const requestRef = useRef(0);

  const rows = useMemo(() => deviceVoiceRows(voices), [voices]);

  useEffect(() => {
    return () => {
      requestRef.current += 1;
      void deviceSpeech()?.stop().catch(() => undefined);
    };
  }, []);

  const stop = useCallback(() => {
    requestRef.current += 1;
    void deviceSpeech()?.stop().catch(() => undefined);
    setPreviewing(null);
  }, []);

  const preview = useCallback(
    async (item: DeviceVoice) => {
      const speech = deviceSpeech();
      const request = ++requestRef.current;
      await speech?.stop().catch(() => undefined);
      if (!speech || request !== requestRef.current) return;

      setPreviewing(item.identifier);
      const finish = () => {
        if (request === requestRef.current) setPreviewing(null);
      };
      speech.speak(PREVIEW_PHRASE, {
        voice: item.identifier || undefined,
        language: item.language || undefined,
        onDone: finish,
        onStopped: finish,
        onError: finish,
      });
    },
    [],
  );

  return { voices, rows, loading, previewing, preview, stop };
}
