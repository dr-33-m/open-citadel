import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { Choice } from '@/components/choice-chips';
import type { AiVoiceSectionProps } from '@/features/tts/components/ai-voice-section';
import {
  ENGINE_INFO,
  TTS_ENGINES,
  engineOf,
  isAiVoice,
  resolveVoice,
  voicesOf,
  type AiVoice,
  type TtsEngineId,
} from '@/services/device-tts/catalogue';
import { SUPERTONIC_RATES } from '@/services/device-tts/supertonic';
import { useSettingsStore } from '@/stores/settings';
import { useTtsStore } from '@/stores/tts';

const ENGINE_CHOICES: Choice<TtsEngineId>[] = TTS_ENGINES.map((engine) => ({
  value: engine,
  label: ENGINE_INFO[engine].label,
}));

/**
 * Which voice box the Enhanced reading voice uses, that box's voices, and its
 * download.
 *
 * The voice box is never saved on its own: it is the one the remembered voice
 * belongs to, so choosing a box is choosing one of its voices. That is the
 * voice the box was last left on in this visit, or its first.
 */
export function useAiVoiceEngine() {
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const ttsNaturalVoice = useSettingsStore((s) => s.ttsNaturalVoice);
  const setTtsVoice = useSettingsStore((s) => s.setTtsVoice);
  const packs = useTtsStore((s) => s.packs);
  const downloadModel = useTtsStore((s) => s.downloadModel);
  const cancelDownload = useTtsStore((s) => s.cancelDownload);

  // The voice in use when it is an Enhanced one; with a Lite voice chosen,
  // the Enhanced voice that switching back would return to.
  const selected = resolveVoice(isAiVoice(ttsVoice) ? ttsVoice : ttsNaturalVoice);
  const engine = engineOf(selected);

  const leftOn = useRef<Partial<Record<TtsEngineId, AiVoice>>>({});
  useEffect(() => {
    leftOn.current[engine] = selected;
  }, [engine, selected]);

  const onEngineChange = useCallback(
    (next: TtsEngineId) => void setTtsVoice(leftOn.current[next] ?? voicesOf(next)[0]!),
    [setTtsVoice],
  );
  const onPick = useCallback((voice: AiVoice) => void setTtsVoice(voice), [setTtsVoice]);
  const onDownload = useCallback(() => void downloadModel(engine), [downloadModel, engine]);
  const onCancel = useCallback(() => cancelDownload(engine), [cancelDownload, engine]);

  return useMemo(() => {
    const pack = packs[engine];
    const section: Omit<AiVoiceSectionProps, 'mark'> = {
      engine,
      choices: ENGINE_CHOICES,
      hint: ENGINE_INFO[engine].hint,
      voices: voicesOf(engine),
      downloaded: pack.isDownloaded,
      selected,
      downloadSize: ENGINE_INFO[engine].downloadSize,
      progress: pack.downloadProgress,
      onEngineChange,
      onPick,
      onDownload,
      onCancel,
    };
    return {
      section,
      /** The chosen voice box has its voices, so there is a speed to set. */
      downloaded: pack.isDownloaded,
      /** The speeds the chosen voice box can read at, or undefined for the full range. */
      rates: engine === 'supertonic' ? SUPERTONIC_RATES : undefined,
    };
  }, [engine, selected, packs, onEngineChange, onPick, onDownload, onCancel]);
}
