import React from 'react';

import { VoiceListPicker } from '@/features/tts/components/voice-list-picker';
import { useVoiceListPicker } from '@/features/tts/hooks/use-voice-list-picker';
import { useVoicePreview } from '@/features/tts/hooks/use-voice-preview';
import { enhancedVoiceRows } from '@/features/tts/utils/enhanced-voices';
import { voiceDescriptor, voiceLabel, type AiVoice } from '@/services/device-tts/catalogue';
import type { DeviceVoice } from '@/utils/device-voices';

export interface EnhancedVoicePickerProps {
  /** The chosen voice box's voices. */
  voices: readonly AiVoice[];
  /** The voice in use, which is one of them. */
  selected: AiVoice;
  onPick: (voice: AiVoice) => void;
}

const NAMING = { label: voiceLabel, descriptor: voiceDescriptor };

/**
 * The Enhanced voice: the chosen voice box's voices in the one voice picker
 * (`VoiceListPicker`), each with a sample made on the phone.
 *
 * It was a carousel of cards. One voice showed at a time, so comparing two
 * meant swiping between them, and ten cards were the dearest thing in the
 * panel to build. A list shows every name at once and costs nothing until it
 * is opened.
 */
export function EnhancedVoicePicker({ voices, selected, onPick }: EnhancedVoicePickerProps) {
  const { previewingVoice, preparingVoice, previewError, previewNotice, preview, stop } = useVoicePreview();
  const rows = React.useMemo(() => enhancedVoiceRows(voices, NAMING), [voices]);
  const start = React.useCallback((voice: DeviceVoice) => preview(voice.identifier as AiVoice), [preview]);
  const pick = React.useCallback((voice: DeviceVoice) => onPick(voice.identifier as AiVoice), [onPick]);
  const picker = useVoiceListPicker({ previewing: previewingVoice, start, stop, onPick: pick });

  return (
    <VoiceListPicker
      name={voiceLabel(selected)}
      accessibilityLabel="Choose an Enhanced voice"
      rows={rows}
      loading={false}
      selected={selected}
      previewing={previewingVoice}
      preparing={preparingVoice}
      note={previewError || previewNotice}
      {...picker.sheet}
    />
  );
}
