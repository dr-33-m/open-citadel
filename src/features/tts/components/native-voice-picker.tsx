import React from 'react';

import { VoiceListPicker } from '@/features/tts/components/voice-list-picker';
import { useDeviceVoices } from '@/features/tts/hooks/use-device-voices';
import { useVoiceListPicker } from '@/features/tts/hooks/use-voice-list-picker';
import { deviceVoiceName, type DeviceVoice } from '@/utils/device-voices';

export interface NativeVoicePickerProps {
  /** The saved phone voice's identifier, '' for the system default. */
  selected: string;
  /** `identifier` and `language` are '' for the system default. */
  onSelect: (identifier: string, language: string) => void;
}

/**
 * The Lite voice: the phone's own English voices in the one voice picker
 * (`VoiceListPicker`), each with a preview the phone speaks itself.
 */
export function NativeVoicePicker({ selected, onSelect }: NativeVoicePickerProps) {
  const { voices, rows, loading, previewing, preview, stop } = useDeviceVoices();
  const pick = React.useCallback((voice: DeviceVoice) => onSelect(voice.identifier, voice.language), [onSelect]);
  const picker = useVoiceListPicker({ previewing, start: preview, stop, onPick: pick });

  return (
    <VoiceListPicker
      name={deviceVoiceName(voices, selected)}
      accessibilityLabel="Choose a Lite voice"
      rows={rows}
      loading={loading}
      selected={selected}
      previewing={previewing}
      {...picker.sheet}
    />
  );
}
