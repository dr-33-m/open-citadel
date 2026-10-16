import React from 'react';
import { View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { CloudVoicePicker } from '@/features/tts/components/cloud-voice-picker';
import { ReadingSpeedStepper } from '@/features/tts/components/reading-speed-stepper';
import type { BoxContent } from '@/features/tts/utils/cloud-voice-cards';
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
 * chips where it has more than one, then the narrator row, and reading speed
 * where the box takes it. What a version is like is said in the sheet behind
 * its "i", not in a line under the chips; a box with one version has no chip,
 * so its tab carries the "i" (`CloudVoicePane`).
 */
function CloudBoxPaneView({ content, onModel, onVoice, onInfo }: CloudBoxPaneProps) {
  const { model, voice, versions } = content;
  const hasVersions = versions.length > 0;

  return (
    // Chips carry a label of their own, which wants a little more air above
    // it; a box with none starts at its narrator row, right under the switch.
    <View className={cn('gap-4', hasVersions && 'pt-2')}>
      {hasVersions ? (
        <ChoiceChips label="VERSION" choices={versions} value={model.id} onChange={onModel} onInfo={onInfo} gutter="none" fill />
      ) : null}
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
