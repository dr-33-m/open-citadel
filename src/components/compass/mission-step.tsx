import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { CompassMissionStep } from 'samwell-shared';

import { missionIcon } from '@/components/compass/mission-icon';
import { ThemedText } from '@/components/themed-text';

export function MissionStep({
  index,
  step,
  showIcon = true,
}: {
  index: number;
  step: CompassMissionStep;
  showIcon?: boolean;
}) {
  const Icon = missionIcon(step.icon);

  // ThemedText's `color` and a lucide icon's `color` both need a literal
  // value, not a className — resolve the tokens once here.
  const foregroundVar = useCSSVariable('--color-foreground');
  const primaryVar = useCSSVariable('--color-primary');
  const mutedForegroundVar = useCSSVariable('--color-muted-foreground');
  const foreground = typeof foregroundVar === 'string' ? foregroundVar : undefined;
  const primary = typeof primaryVar === 'string' ? primaryVar : undefined;
  const mutedForeground = typeof mutedForegroundVar === 'string' ? mutedForegroundVar : undefined;

  return (
    <View className="flex-row items-center gap-3 bg-surface p-3">
      {showIcon ? (
        <View className="h-9 w-9 items-center justify-center bg-surface-tertiary">
          <Icon size={18} color={foreground} />
        </View>
      ) : (
        <View className="h-6 w-6 items-center justify-center border border-primary">
          <ThemedText type="labelSm" color={primary} style={{ fontVariant: ['tabular-nums'] }}>
            {index}
          </ThemedText>
        </View>
      )}
      <View className="flex-1 gap-0.5">
        <ThemedText type="bodyMd">{step.title}</ThemedText>
        {step.detail.length > 0 && (
          <ThemedText type="bodySm" color={mutedForeground}>
            {step.detail}
          </ThemedText>
        )}
      </View>
    </View>
  );
}
