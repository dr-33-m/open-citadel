import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { AudioLines, ChevronUp, Volume2 } from 'lucide-react-native';

import {
  useVoicePicker,
  type VoiceItem,
  type VoiceListRow,
} from '@/features/settings/hooks/use-voice-picker';
import { SettingsSection } from '@/features/settings/components/settings-section';
import { ThemedText } from '@/components/themed-text';
import { VoiceListSkeleton } from '@/components/skeletons/voice-list-skeleton';
import { PageFade } from '@/components/scroll-fades';
import { Card } from '@/components/ui/card';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
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
    <SettingsSection label="TEXT TO SPEECH">
      <ThemedText type="labelSm" color={asColor(mutedForeground)}>READING SPEED</ThemedText>
      <View className="flex-row flex-wrap gap-2">
        {TTS_RATES.map((r) => {
          const active = Math.abs(ttsRate - r) < 0.01;
          return (
            <Touchable key={r} onPress={() => setTtsRate(r)}>
              <Card className={cn('px-4 py-2', active && 'border-primary bg-primary')}>
                <ThemedText type="labelSm" color={active ? asColor(primaryForeground) : undefined}>
                  {r === 1 ? '1×' : `${r}×`}
                </ThemedText>
              </Card>
            </Touchable>
          );
        })}
      </View>

      <Touchable onPress={() => void picker.open()}>
        <Card className="flex-row items-center justify-between p-4">
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
        </Card>
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


  const renderRow = React.useCallback(
    ({ item }: { item: VoiceListRow }) => {
      if (item.kind === 'header') {
        return (
          <View className="bg-popover px-6 py-2">
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>
              {item.title}
            </ThemedText>
          </View>
        );
      }
      const { voice } = item;
      const isSelected = voice.identifier
        ? currentVoice === voice.identifier
        : currentVoice === null;
      return (
        <VoiceRow
          voice={voice}
          isSelected={isSelected}
          isPreviewing={picker.previewing === voice.identifier}
          primary={asColor(primary)}
          mutedForeground={asColor(mutedForeground)}
          onSelect={handleSelect}
          onPreview={picker.preview}
        />
      );
    },
    [currentVoice, picker.previewing, picker.preview, primary, mutedForeground, handleSelect],
  );

  return (
    /*
     * Two detents rather than a full-screen modal: the list is long enough to
     * browse, so it opens at half height — the settings row you came from
     * stays visible behind it — and grows to full only if you commit to
     * hunting through it. The old `Modal` could only be all or nothing.
     */
    <Sheet visible={picker.visible} onClose={picker.close} snapRatios={[0.5, 1]}>
      <View className="flex-row items-center justify-between px-6 pb-3">
        <ThemedText type="headlineSm">Select voice</ThemedText>
      </View>

      {/* Two waits, one placeholder. `Sheet.Deferred` covers the frames while
          the list mounts, and the same skeleton covers the device's voice
          query — so the sheet goes skeleton to voices with nothing in
          between, rather than a spinner that swaps for a list. */}
      <Sheet.Deferred skeleton={<VoiceListSkeleton />}>
        {picker.loading ? (
          <VoiceListSkeleton />
        ) : (
          <PageFade edges="both" surface="popover">
            <Sheet.FlatList
              data={picker.rows}
              keyExtractor={(item: VoiceListRow) => item.key}
              // Headings and voices recycle in separate pools; without this a
              // heading cell would be re-bound to a voice and keep its styling.
              getItemType={(item: VoiceListRow) => item.kind}
              extraData={picker.previewing}
              renderItem={renderRow}
            />
          </PageFade>
        )}
      </Sheet.Deferred>
    </Sheet>
  );
}
