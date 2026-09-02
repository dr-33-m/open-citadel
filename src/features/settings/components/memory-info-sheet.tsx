import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { MemoryStick } from '@/components/icons';

import { Sheet } from '@/components/ui/sheet';
import { ThemedText } from '@/components/themed-text';
import { asColor } from '@/utils/colors';

type MemoryEstimate = {
  status: string;
  minDeviceMemoryGb?: number | null;
  totalGb?: number;
};

const TIGHT = '#f97316';

/** What "TIGHT"/"TOO LARGE" actually means, with the numbers behind it. */
export function MemoryInfoSheet({
  visible,
  onClose,
  status,
  estimate,
}: {
  visible: boolean;
  onClose: () => void;
  status: string;
  estimate: MemoryEstimate | null;
}) {
  const [mutedForeground, destructive] = useCSSVariable([
    '--color-muted-foreground',
    '--color-destructive',
  ]);
  const wontFit = status === 'wont_fit';

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View className="gap-6 px-6">
        <View className="flex-row items-center gap-2">
          <MemoryStick size={18} color={wontFit ? asColor(destructive) : TIGHT} />
          <ThemedText type="headlineSm">{wontFit ? 'Too Large' : 'Memory Tight'}</ThemedText>
        </View>
        <ThemedText type="bodySm" color={asColor(mutedForeground)}>
          {wontFit
            ? 'This model needs more RAM than your device has. Loading it will likely crash the app. Try a smaller or more quantized model.'
            : 'This model may run slowly or fail to wake up. Free up RAM by closing other apps, or try a smaller model.'}
        </ThemedText>
        {estimate && (
          <View className="gap-1">
            {estimate.minDeviceMemoryGb != null && (
              <ThemedText type="labelSm" color={asColor(mutedForeground)} style={{ fontVariant: ['tabular-nums'] }}>
                Minimum RAM: {estimate.minDeviceMemoryGb} GB
              </ThemedText>
            )}
            {estimate.totalGb != null && (
              <ThemedText type="labelSm" color={asColor(mutedForeground)} style={{ fontVariant: ['tabular-nums'] }}>
                Device RAM: {estimate.totalGb.toFixed(1)} GB
              </ThemedText>
            )}
          </View>
        )}
      </View>
    </Sheet>
  );
}
