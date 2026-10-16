import React from 'react';

import { VoiceListPicker } from '@/features/tts/components/voice-list-picker';
import { useCloudSamplePreview } from '@/features/tts/hooks/use-cloud-sample-preview';
import { useVoiceListPicker } from '@/features/tts/hooks/use-voice-list-picker';
import { cloudVoiceLabel, cloudVoiceRows } from '@/features/tts/utils/cloud-voice-names';
import type { DeviceVoice } from '@/utils/device-voices';

export interface CloudVoicePickerProps {
  modelId: string;
  /** The voices this model offers a reader. */
  voices: readonly string[];
  selected: string;
  onPick: (voice: string) => void;
}

/**
 * The cloud voice: a voice box's voices in the one voice picker
 * (`VoiceListPicker`), each with its free sample. Picking a voice the way
 * the other two are picked is what makes Cloud read as a third kind of the
 * same thing.
 */
export function CloudVoicePicker({ modelId, voices, selected, onPick }: CloudVoicePickerProps) {
  const { previewingVoice, preparingVoice, previewError, preview, stop } = useCloudSamplePreview(modelId);
  const rows = React.useMemo(() => cloudVoiceRows(voices), [voices]);
  const start = React.useCallback((voice: DeviceVoice) => preview(voice.identifier), [preview]);
  const pick = React.useCallback((voice: DeviceVoice) => onPick(voice.identifier), [onPick]);
  const picker = useVoiceListPicker({ previewing: previewingVoice, start, stop, onPick: pick });

  return (
    <VoiceListPicker
      name={cloudVoiceLabel(selected)}
      // A cloud voice box reads with one of its people, so the choice is
      // who narrates rather than which voice.
      label="Narrator"
      title="Select Narrator"
      accessibilityLabel="Choose a narrator"
      rows={rows}
      loading={false}
      selected={selected}
      previewing={previewingVoice}
      preparing={preparingVoice}
      note={previewError}
      {...picker.sheet}
    />
  );
}
