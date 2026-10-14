import React from 'react';
import { View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Info } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { CloudVoicePicker } from '@/features/tts/components/cloud-voice-picker';
import { ReadingSpeedStepper } from '@/features/tts/components/reading-speed-stepper';
import type { BoxContent } from '@/features/tts/utils/cloud-voice-cards';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { cn } from '@/lib/cn';

export interface CloudBoxPaneProps {
  /** This is the box chosen. A pane that is not holds what it last showed. */
  active: boolean;
  content: BoxContent;
  onModel: (modelId: string) => void;
  onVoice: (voice: string) => void;
  /** Opens what a version costs, behind its circled "i". */
  onInfo: (modelId: string) => void;
}

/**
 * Everything that belongs to one voice box, under its tab: its versions as
 * chips where it has more than one, one line on what the chosen version is
 * like, the voice row, and reading speed where the box takes it. A box with
 * one version has no chip to carry the "i", so the mark sits beside its line.
 */
function CloudBoxPaneView({ content, onModel, onVoice, onInfo }: CloudBoxPaneProps) {
  const muted = useThemeTokens()['--color-muted-foreground'];
  const { model, voice, versions } = content;
  const hasVersions = versions.length > 0;
  const line = (
    <View className="flex-row items-start gap-3">
      <ThemedText type="bodySm" color={muted} className="flex-1">
        {model.description}
      </ThemedText>
      {hasVersions ? null : (
        <Touchable onPress={() => onInfo(model.id)} haptic="tap" hitSlop={10} accessibilityRole="button" accessibilityLabel={`About ${model.label}`}>
          <Info size={16} color={muted} />
        </Touchable>
      )}
    </View>
  );

  return (
    // A box's line sits right under the switch, as Lite's does; chips carry
    // a label of their own, which wants a little more air above it.
    <View className={cn('gap-4', hasVersions && 'pt-2')}>
      {hasVersions ? (
        <View className="gap-2">
          <ChoiceChips label="VERSION" choices={versions} value={model.id} onChange={onModel} onInfo={onInfo} gutter="none" fill />
          {line}
        </View>
      ) : (
        line
      )}
      <CloudVoicePicker modelId={model.id} voices={model.voices} selected={voice} onPick={onVoice} />
      {model.speedSupported ? <ReadingSpeedStepper /> : null}
    </View>
  );
}

/**
 * Held still while it is not the box chosen. A pane that has just been left
 * is still on screen for the length of its fade, and what its tab would land
 * on next time is not always what it was showing; drawn afresh then, it would
 * change under the fade. It takes its new content when it is chosen again,
 * before it can be seen.
 */
export const CloudBoxPane = React.memo(CloudBoxPaneView, (_, next) => !next.active);
