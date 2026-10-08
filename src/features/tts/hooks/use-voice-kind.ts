import { useCallback } from 'react';

import type { VoiceSource } from '@/features/tts/utils/voice-copy';
import {
  DEFAULT_VOICE,
  DEVICE_VOICE,
  isAiVoice,
  voiceMode,
  type OnDeviceMode,
} from '@/services/device-tts/catalogue';
import { lastDeviceVoice, useSettingsStore } from '@/stores/settings';

/**
 * Which kind of voice reads, and the ways to change it.
 *
 * The kind is never saved on its own: it is the kind of the saved voice. So
 * choosing a kind is choosing a voice of that kind, and each kind remembers
 * the voice it was last left on, which is what switching back returns to.
 * The same holds a level up for the source: choosing On-device while a cloud
 * voice reads goes back to the on-device voice that was reading before.
 *
 * While a cloud voice reads, `mode` is the on-device kind that would come
 * back, so the on-device switch never shows a kind nobody chose.
 */
export function useVoiceKind() {
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const setTtsVoice = useSettingsStore((s) => s.setTtsVoice);
  const ttsNaturalVoice = useSettingsStore((s) => s.ttsNaturalVoice);
  const ttsPhoneVoice = useSettingsStore((s) => s.ttsPhoneVoice);
  const ttsPhoneVoiceLanguage = useSettingsStore((s) => s.ttsPhoneVoiceLanguage);

  // Read whole rather than subscribed field by field: every field it reads
  // changes in the same write as `ttsVoice`, which this already follows.
  const current = voiceMode(ttsVoice);
  const source: VoiceSource = current === 'cloud' ? 'cloud' : 'device';
  const deviceVoice = current === 'cloud' ? lastDeviceVoice(useSettingsStore.getState()).voice : ttsVoice;
  const mode = voiceMode(deviceVoice) as OnDeviceMode;

  const selectKind = (next: OnDeviceMode) => {
    if (next === mode && source === 'device') return;
    if (next === 'ai') void setTtsVoice(ttsNaturalVoice ?? DEFAULT_VOICE);
    else void setTtsVoice(ttsPhoneVoice || DEVICE_VOICE, ttsPhoneVoiceLanguage);
  };

  /** Back to the on-device voice that was reading before the cloud. */
  const selectDevice = useCallback(() => {
    const state = useSettingsStore.getState();
    if (voiceMode(state.ttsVoice) !== 'cloud') return;
    const back = lastDeviceVoice(state);
    void state.setTtsVoice(back.voice ?? DEFAULT_VOICE, back.language);
  }, []);

  /** `identifier` and `language` are '' for the system default. */
  const selectPhoneVoice = useCallback(
    (identifier: string, language: string) => {
      void setTtsVoice(identifier || DEVICE_VOICE, language || null);
    },
    [setTtsVoice],
  );

  return {
    source,
    mode,
    // The saved phone voice's identifier, '' for the system default (which is
    // also what an Enhanced voice or nothing at all means here).
    liteVoiceId: isAiVoice(deviceVoice) || deviceVoice === DEVICE_VOICE ? '' : (deviceVoice ?? ''),
    selectKind,
    selectDevice,
    selectPhoneVoice,
  };
}
