import React from 'react';
import { Modal, SectionList, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { AudioLines, ChevronUp, Volume2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useVoicePicker, type VoiceItem } from '@/features/settings/hooks/use-voice-picker';
import { SettingsSection } from '@/features/settings/components/settings-section';
import { ThemedText } from '@/components/themed-text';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { Spinner } from '@/components/ui/spinner';
import { Touchable } from '@/components/ui/touchable';
import { elevation } from '@/constants/theme';
import { useSettingsStore } from '@/stores/settings';
import { asColor } from '@/utils/colors';
import { cn } from '@/lib/cn';

const TTS_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * Text-to-speech: reading speed and the voice. Owns the voice modal.
 */
export function TtsSection() {
  const [mutedForeground, primaryForeground] = useCSSVariable([
    '--color-muted-foreground',
    '--color-primary-foreground',
  ]);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const ttsRate = useSettingsStore((s) => s.ttsRate);
  const setTtsVoice = useSettingsStore((s) => s.setTtsVoice);
  const setTtsRate = useSettingsStore((s) => s.setTtsRate);

  const picker = useVoicePicker(ttsVoice);

  return (
    <SettingsSection index={5} label="TEXT TO SPEECH">
      <ThemedText type="labelSm" color={asColor(mutedForeground)}>READING SPEED</ThemedText>
      <View className="flex-row flex-wrap gap-2">
        {TTS_RATES.map((r) => {
          const active = Math.abs(ttsRate - r) < 0.01;
          return (
            <Touchable
              key={r}
              className={cn('bg-card px-4 py-2', active && 'bg-primary')}
              style={elevation.soft}
              onPress={() => setTtsRate(r)}
            >
              <ThemedText type="labelSm" color={active ? asColor(primaryForeground) : undefined}>
                {r === 1 ? '1×' : `${r}×`}
              </ThemedText>
            </Touchable>
          );
        })}
      </View>

      <Touchable
        className="flex-row items-center justify-between bg-card p-4"
        style={elevation.soft}
        onPress={() => void picker.open()}
      >
        <View className="flex-row items-center gap-3">
          <PrefixIcon icon={AudioLines} size={36} />
          <ThemedText type="bodyMd">Voice</ThemedText>
        </View>
        <View className="flex-row items-center gap-1">
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            {picker.currentName}
          </ThemedText>
          <ChevronUp size={14} color={asColor(mutedForeground)} />
        </View>
      </Touchable>

      <VoicePickerModal
        picker={picker}
        currentVoice={ttsVoice}
        onSelect={(identifier, language) => {
          setTtsVoice(identifier, language);
          picker.close();
        }}
      />
    </SettingsSection>
  );
}

/**
 * One voice row, memoized on primitives: a selection or preview flip
 * re-renders the affected rows, not every voice in the picker.
 */
const VoiceRow = React.memo(function VoiceRow({
  voice,
  isSelected,
  isPreviewing,
  primary,
  mutedForeground,
  onSelect,
  onPreview,
}: {
  voice: VoiceItem;
  isSelected: boolean;
  isPreviewing: boolean;
  primary?: string;
  mutedForeground?: string;
  onSelect: (identifier: string | null, language: string | null) => void;
  onPreview: (voice: VoiceItem) => void;
}) {
  return (
    <Touchable
      className="flex-row items-center gap-4 border-b border-card px-6 py-4"
      onPress={() => onSelect(voice.identifier || null, voice.language || null)}
    >
      <View className="flex-1 gap-1">
        <ThemedText type="bodyMd">{voice.name}</ThemedText>
        {voice.language ? (
          <ThemedText type="labelSm" color={mutedForeground}>
            {voice.language}
          </ThemedText>
        ) : null}
      </View>
      {voice.quality ? (
        <View className="bg-muted px-2 py-[2px]">
          <ThemedText type="labelSm" color={mutedForeground}>
            {voice.quality}
          </ThemedText>
        </View>
      ) : null}
      {voice.identifier ? (
        <Touchable onPress={(e) => { e.stopPropagation(); onPreview(voice); }} hitSlop={8}>
          <Volume2
            size={18}
            color={isPreviewing ? primary : mutedForeground}
          />
        </Touchable>
      ) : null}
      {isSelected && (
        <ThemedText type="bodyMd" color={primary}>✓</ThemedText>
      )}
    </Touchable>
  );
});

function VoicePickerModal({
  picker,
  currentVoice,
  onSelect,
}: {
  picker: ReturnType<typeof useVoicePicker>;
  currentVoice: string | null;
  onSelect: (identifier: string | null, language: string | null) => void;
}) {
  const [primary, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);
  const insets = useSafeAreaInsets();

  /*
   * `onSelect` arrives as an inline arrow from the call site, so it cannot
   * key the memoized rows directly. It rides in through a ref instead —
   * taps land after commit, so the effect-synced ref never misses.
   */
  const onSelectRef = React.useRef(onSelect);
  React.useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const handleSelect = React.useCallback(
    (identifier: string | null, language: string | null) => {
      onSelectRef.current(identifier, language);
    },
    [],
  );

  const renderItem = React.useCallback(
    ({ item }: { item: VoiceItem }) => {
      const isSelected = item.identifier
        ? currentVoice === item.identifier
        : currentVoice === null;
      const isPreviewing = picker.previewing === item.identifier;
      return (
        <VoiceRow
          voice={item}
          isSelected={isSelected}
          isPreviewing={isPreviewing}
          primary={asColor(primary)}
          mutedForeground={asColor(mutedForeground)}
          onSelect={handleSelect}
          onPreview={picker.preview}
        />
      );
    },
    [currentVoice, picker.previewing, picker.preview, primary, mutedForeground, handleSelect],
  );

  const renderSectionHeader = React.useCallback(
    ({ section }: { section: { title: string } }) => (
      <View className="bg-background px-6 py-2">
        <ThemedText type="labelSm" color={asColor(mutedForeground)}>
          {section.title}
        </ThemedText>
      </View>
    ),
    [mutedForeground],
  );

  return (
    <Modal visible={picker.visible} animationType="slide" onRequestClose={picker.close}>
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center justify-between border-b border-surface-tertiary px-6 py-5">
          <ThemedText type="headlineMd">Select Voice</ThemedText>
          <Touchable onPress={picker.close} hitSlop={12}>
            <ThemedText type="bodyMd" color={asColor(primary)}>Done</ThemedText>
          </Touchable>
        </View>

        {picker.loading ? (
          <View className="flex-1 items-center justify-center">
            <Spinner size="sm" />
          </View>
        ) : (
          <SectionList
            sections={picker.sections}
            keyExtractor={(item) => item.identifier || '__default__'}
            renderSectionHeader={renderSectionHeader}
            renderItem={renderItem}
          />
        )}
      </View>
    </Modal>
  );
}
