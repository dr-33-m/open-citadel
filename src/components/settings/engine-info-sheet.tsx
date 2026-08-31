import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';

export type EngineMode = 'offline' | 'cloud';

type EngineInfo = {
  label: string;
  persona: string;
  points: string[];
};

const CONTENT: Record<EngineMode, EngineInfo> = {
  offline: {
    label: 'OFFLINE',
    persona: 'Samwell on your device.',
    points: [
      'He runs entirely on your device. Nothing you say leaves your phone.',
      'Works anywhere, with no internet.',
      'No usage limits, and free.',
      'He is bound by your phone, so he uses a smaller model than the cloud.',
      'Compass is not available offline.',
    ],
  },
  cloud: {
    label: 'CLOUD',
    persona: 'Grand Maester Samwell in the cloud.',
    points: [
      'In the cloud, Samwell becomes Grand Maester Samwell, running the largest models.',
      'Deeper thinking and sharper insight than any phone can manage.',
      'Compass is only available here, with Grand Maester Samwell.',
      'Needs an internet connection. Only what each request needs is sent, nothing more.',
    ],
  },
};

export function EngineInfoSheet({ mode, onClose }: { mode: EngineMode | null; onClose: () => void }) {
  // ThemedText's `color` prop takes a literal, never a className.
  const primary = useCSSVariable('--color-primary');
  const mutedForeground = useCSSVariable('--color-muted-foreground');
  const labelColor = typeof primary === 'string' ? primary : undefined;
  const pointColor = typeof mutedForeground === 'string' ? mutedForeground : undefined;

  const info = mode ? CONTENT[mode] : null;

  return (
    <Sheet visible={mode !== null} onClose={onClose}>
      {info && (
        <View className="gap-6 px-6">
          <View className="gap-1">
            <ThemedText type="labelSm" color={labelColor}>
              {info.label}
            </ThemedText>
            <ThemedText type="headlineSm">{info.persona}</ThemedText>
          </View>
          <View className="gap-3">
            {info.points.map((point) => (
              <View key={point} className="flex-row gap-3">
                <View className="h-1 w-1 bg-primary" style={{ marginTop: 8 }} />
                <ThemedText type="bodySm" color={pointColor} className="flex-1">
                  {point}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>
      )}
    </Sheet>
  );
}
