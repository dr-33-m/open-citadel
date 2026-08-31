import * as Speech from 'expo-speech';
import React from 'react';

export type VoiceItem = {
  identifier: string;
  name: string;
  language: string;
  quality: string;
};

const PREVIEW_PHRASE = 'Hello, this is a preview of this voice.';

/**
 * Everything the TTS voice picker needs: loading the device's voices on
 * open, grouping them for a SectionList, previewing one, and naming the
 * current choice for the row on the settings body.
 *
 * Owns no persistence — `select` hands the choice back; the caller writes
 * it to the settings store.
 */
export function useVoicePicker(currentVoice: string | null) {
  const [visible, setVisible] = React.useState(false);
  const [voices, setVoices] = React.useState<VoiceItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [previewing, setPreviewing] = React.useState<string | null>(null);

  const open = React.useCallback(async () => {
    setVisible(true);
    setLoading(true);
    try {
      const available = await Speech.getAvailableVoicesAsync();
      setVoices(
        available.map((v) => ({
          identifier: v.identifier,
          name: v.name,
          language: v.language,
          quality: v.quality === Speech.VoiceQuality.Enhanced ? 'ENHANCED' : 'DEFAULT',
        })),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const close = React.useCallback(() => setVisible(false), []);

  const select = React.useCallback(
    (identifier: string | null, language: string | null) => {
      // The store write stays with the caller; the modal just closes here.
      setVisible(false);
      return { identifier, language };
    },
    [],
  );

  const preview = React.useCallback(
    (item: VoiceItem) => {
      if (previewing === item.identifier) {
        Speech.stop();
        setPreviewing(null);
        return;
      }
      Speech.stop();
      setPreviewing(item.identifier);
      Speech.speak(PREVIEW_PHRASE, {
        voice: item.identifier || undefined,
        language: item.language || undefined,
        onDone: () => setPreviewing(null),
        onStopped: () => setPreviewing(null),
        onError: () => setPreviewing(null),
      });
    },
    [previewing],
  );

  // SectionList wants {title, data[]} groups; a DEFAULT row leads so there
  // is always an escape hatch back to the system voice.
  const sections = React.useMemo(() => {
    const byLang: Record<string, VoiceItem[]> = {};
    for (const v of voices) {
      const lang = v.language.split('-')[0].toUpperCase();
      (byLang[lang] ??= []).push(v);
    }
    const grouped = Object.entries(byLang)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([title, data]) => ({ title, data }));
    return [
      { title: 'DEFAULT', data: [{ identifier: '', name: 'System default', language: '', quality: '' }] },
      ...grouped,
    ];
  }, [voices]);

  const currentName = React.useMemo(() => {
    if (!currentVoice) return 'System default';
    return voices.find((v) => v.identifier === currentVoice)?.name ?? currentVoice;
  }, [currentVoice, voices]);

  return { visible, loading, sections, previewing, currentName, open, close, select, preview };
}
