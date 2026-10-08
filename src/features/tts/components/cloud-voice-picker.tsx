import React from 'react';
import { View } from 'react-native';

import { useOnScreen } from '@/components/kept-alive';
import { ThemedText } from '@/components/themed-text';
import { DeviceVoiceSheet } from '@/features/tts/components/device-voice-sheet';
import { VoicePickerRow } from '@/features/tts/components/voice-picker-row';
import { useCloudSamplePreview } from '@/features/tts/hooks/use-cloud-sample-preview';
import { cloudVoiceLabel, cloudVoiceRows } from '@/features/tts/utils/cloud-voice-names';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { DeviceVoice } from '@/utils/device-voices';

export interface CloudVoicePickerProps {
  modelId: string;
  /** The voices this model offers a reader. */
  voices: readonly string[];
  selected: string;
  onPick: (voice: string) => void;
}

/**
 * The cloud voice: the same row and the same list as the Lite and Enhanced
 * voices, each voice with its free sample. Picking a voice the way the other
 * two are picked is what makes Cloud read as a third kind of the same thing.
 */
export function CloudVoicePicker({ modelId, voices, selected, onPick }: CloudVoicePickerProps) {
  const muted = useThemeTokens()['--color-muted-foreground'];
  const [open, setOpen] = React.useState(false);
  const { previewingVoice, preparingVoice, previewError, preview, stop } = useCloudSamplePreview(modelId);
  const rows = React.useMemo(() => cloudVoiceRows(voices), [voices]);

  const close = React.useCallback(() => {
    stop();
    setOpen(false);
  }, [stop]);

  // Put away rather than removed (`KeptAlive`): a sample must not play on
  // under whatever took the pane's place.
  const onScreen = useOnScreen();
  React.useEffect(() => {
    if (!onScreen) stop();
  }, [onScreen, stop]);

  const handleSelect = React.useCallback(
    (voice: DeviceVoice) => {
      onPick(voice.identifier);
      close();
    },
    [onPick, close],
  );
  // Through a ref, so the handler keeps one identity and a sample starting or
  // ending redraws the one row it concerns (as `EnhancedVoicePicker` does).
  const playing = React.useRef(previewingVoice);
  React.useEffect(() => {
    playing.current = previewingVoice;
  }, [previewingVoice]);
  const handlePreview = React.useCallback(
    (voice: DeviceVoice) => {
      if (playing.current === voice.identifier) stop();
      else void preview(voice.identifier);
    },
    [preview, stop],
  );

  return (
    <View className="gap-2">
      <VoicePickerRow name={cloudVoiceLabel(selected)} onPress={() => setOpen(true)} accessibilityLabel="Choose a cloud voice" />
      <DeviceVoiceSheet
        visible={open}
        onClose={close}
        rows={rows}
        loading={false}
        selected={selected}
        previewing={previewingVoice}
        preparing={preparingVoice}
        note={previewError}
        onSelect={handleSelect}
        onPreview={handlePreview}
      />
      {previewError && !open ? (
        <ThemedText type="bodySm" color={muted}>
          {previewError}
        </ThemedText>
      ) : null}
    </View>
  );
}
