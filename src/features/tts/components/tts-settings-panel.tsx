import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { EnhancedVoicePane } from '@/features/tts/components/enhanced-voice-pane';
import { LiteVoicePane } from '@/features/tts/components/lite-voice-pane';
import { VoiceKindPanes } from '@/features/tts/components/voice-kind-panes';
import { useAiVoiceEngine } from '@/features/tts/hooks/use-ai-voice-engine';
import { useVoiceKind } from '@/features/tts/hooks/use-voice-kind';
import { OnDeviceVoiceSwitch } from '@/features/tts/components/on-device-voice-switch';
import { VoiceSourceCards } from '@/features/tts/components/voice-source-cards';
import { EnhancedFitMark } from '@/features/tts/components/enhanced-fit-mark';
import { EnhancedFitSheet } from '@/features/tts/components/enhanced-fit-sheet';
import { enhancedFit } from '@/features/tts/utils/enhanced-fit';
import { CloudVoicePane } from '@/features/tts/components/cloud-voice-pane';
import { useCloudVoicePane } from '@/features/tts/hooks/use-cloud-voice-pane';
import { useVoiceSource } from '@/features/tts/hooks/use-voice-source';
import { PlansSheet } from '@/features/billing/components/plans-sheet';
import { ENHANCED_UNSUPPORTED, LITE_SPEED_FIXED, ON_DEVICE_KINDS, onDeviceHint, type VoiceSource } from '@/features/tts/utils/voice-copy';
import { Touchable } from '@/components/ui/touchable';
import {
  AI_VOICES_SUPPORTED,
  NATIVE_SPEED_SUPPORTED,
  NATIVE_VOICE_AVAILABLE,
  type OnDeviceMode,
} from '@/services/device-tts/catalogue';
import { prefetchDeviceVoices } from '@/query-manager/device-voices';
import { asColor } from '@/utils/colors';
import { deviceMemoryBytes } from '@/utils/memory-estimator';

/** The kinds, left to right as the switch draws them. */
const KIND_ORDER = ON_DEVICE_KINDS.map((kind) => kind.mode);

/** The sources, left to right as their cards sit. */
const SOURCE_ORDER: readonly VoiceSource[] = ['device', 'cloud'];

/** How this phone copes with the Enhanced voices. A fact about the phone, so it is read once. */
const ENHANCED_FIT = enhancedFit(deviceMemoryBytes());

export interface TtsSettingsPanelProps {
  /** Closes the sheet this panel is mounted in, shown as a "DONE" control
   * beside the panel's heading. Omitted in Settings, which has its own
   * header and its own way back. */
  onDone?: () => void;
  /**
   * Build the controls that are not showing while they are hidden, so
   * choosing them only reveals them (`KeptAlive`). For Settings, whose pane
   * is itself built after the screen has landed; a sheet leaves it off, since
   * it would build them mid-rise.
   */
  warm?: boolean;
}

/**
 * The reading voice's settings. The first choice is where the voice runs:
 * on-device, or in the cloud. Cloud without a plan raises the plans sheet
 * over the panel (`useVoiceSource`); with one, its pane offers the maker, the
 * voice, what it costs and its speed (`CloudVoicePane`). The two sources'
 * controls trade places under the cards, as the kinds do under their switch.
 * On-device then has two kinds, on one switch, and each shows its own controls:
 *
 * - Enhanced (`ai`): which voice box reads (Supertonic or Kokoro), then that
 *   engine's download card until its voices are on the device, and only then
 *   the voice carousel and reading speed. Before that there is nothing to
 *   preview or pick.
 * - Lite (`native`): the list of the phone's voices, and reading speed
 *   (Android only). Nothing to download.
 *
 * The switch only shows where there is a choice to make: a phone that cannot
 * run the Enhanced voices at all says so in a line and shows the Lite ones,
 * and where there is no Lite path at all (web) only the Enhanced controls
 * show. A phone that can run them but will pause says so in a mark beside
 * their line, which opens `EnhancedFitSheet`: a warning, never a lock.
 *
 * Everything that belongs to a kind is in its pane, and the two panes trade
 * places under the switch (`VoiceKindPanes`). Panes drawn once are kept, so
 * going back to one is a reveal.
 *
 * Otherwise self-contained: it and the components it hosts read and write
 * `useSettingsStore`/`useTtsStore` directly, so the Settings page and the
 * reader's own long-press quick-settings sheet can both mount it and always
 * show the same state.
 */
export function TtsSettingsPanel({ onDone, warm = false }: TtsSettingsPanelProps) {
  const [mutedForeground, primary] = useCSSVariable(['--color-muted-foreground', '--color-primary']);

  const { source, mode, liteVoiceId, selectKind, selectDevice, selectPhoneVoice } = useVoiceKind();
  const ai = useAiVoiceEngine();
  const voiceSource = useVoiceSource({ source, selectDevice });
  const cloud = useCloudVoicePane({ onLockedMaker: voiceSource.openPlansFor });

  React.useEffect(() => {
    // The phone's first answer is the slow one, so it is asked for now,
    // whichever kind of voice is chosen, not when the list is opened.
    if (NATIVE_VOICE_AVAILABLE) prefetchDeviceVoices();
  }, []);

  const nativeNote = NATIVE_SPEED_SUPPORTED ? null : LITE_SPEED_FIXED;
  const canSwitchKind = NATIVE_VOICE_AVAILABLE && AI_VOICES_SUPPORTED;
  const [fitVisible, setFitVisible] = React.useState(false);
  const openFit = React.useCallback(() => setFitVisible(true), []);
  const closeFit = React.useCallback(() => setFitVisible(false), []);

  const switchToLite = () => {
    setFitVisible(false);
    selectKind('native');
  };
  const switchToCloud = () => {
    setFitVisible(false);
    voiceSource.selectCloud();
  };

  const panes: Record<OnDeviceMode, React.ReactNode> = {
    native: (
      <LiteVoicePane
        hint={canSwitchKind ? onDeviceHint('native') : null}
        selected={liteVoiceId}
        onSelect={selectPhoneVoice}
        note={nativeNote}
        showSpeed={NATIVE_SPEED_SUPPORTED}
      />
    ),
    ai: (
      <EnhancedVoicePane
        hint={canSwitchKind ? onDeviceHint('ai') : null}
        mark={<EnhancedFitMark fit={ENHANCED_FIT} onPress={openFit} />}
        section={ai.section}
        showSpeed={ai.downloaded}
        rates={ai.rates}
      />
    ),
  };

  return (
    <View className="gap-4">
      {onDone ? (
        <View className="flex-row items-baseline justify-between">
          <ThemedText type="labelSm" color={asColor(mutedForeground)}>
            READING VOICE
          </ThemedText>
          <Touchable onPress={onDone} haptic="tap" hitSlop={8}>
            <ThemedText type="labelSm" color={asColor(primary)}>
              DONE
            </ThemedText>
          </Touchable>
        </View>
      ) : null}

      <VoiceSourceCards
        source={source}
        cloudLocked={voiceSource.cloudLocked}
        cloudStatus={voiceSource.cloudStatus}
        onSelectDevice={selectDevice}
        onSelectCloud={voiceSource.selectCloud}
      />

      {voiceSource.note ? (
        <ThemedText type="bodySm" color={asColor(mutedForeground)}>
          {voiceSource.note}
        </ThemedText>
      ) : null}

      <VoiceKindPanes
        order={SOURCE_ORDER}
        value={source}
        warm={warm}
        panes={{
          device: (
            <View className="gap-4">
              {NATIVE_VOICE_AVAILABLE && !AI_VOICES_SUPPORTED ? (
                <ThemedText type="bodySm" color={asColor(mutedForeground)}>
                  {ENHANCED_UNSUPPORTED}
                </ThemedText>
              ) : null}
              {/* The switch and what it shows are one group, closer to each
                  other than to the cards above: each kind's line sits right under it. */}
              <View className="gap-2">
                {canSwitchKind ? <OnDeviceVoiceSwitch mode={mode} onChange={selectKind} /> : null}
                <VoiceKindPanes order={KIND_ORDER} value={mode} warm={warm} panes={panes} />
              </View>
            </View>
          ),
          cloud: (
            <CloudVoicePane
              selection={cloud.selection}
              makers={cloud.makers}
              models={cloud.models}
              costs={cloud.costs}
              onMaker={cloud.chooseMaker}
              onModel={cloud.chooseModel}
              onVoice={cloud.chooseVoice}
            />
          ),
        }}
      />

      <EnhancedFitSheet
        visible={fitVisible}
        onClose={closeFit}
        fit={ENHANCED_FIT}
        onUseLite={switchToLite}
        onUseCloud={voiceSource.cloudLocked ? undefined : switchToCloud}
      />
      {/* Over the panel wherever it is mounted: in the reader that is inside
          the voice sheet, so it must push rather than replace it. */}
      <PlansSheet nested {...voiceSource.plans} />
    </View>
  );
}
