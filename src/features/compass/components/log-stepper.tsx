import React from 'react';
import { View } from 'react-native';
import { Minus, Plus } from '@/components/icons';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { asColor } from '@/utils/colors';

type LogStepperProps = {
  value: number;
  unit: string;
  step: number;
  onChange: (next: number) => void;
};

/** Trailing zeros are noise on a count; a half hour still needs its half. */
function format(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

/**
 * A square stepper for a quantity or a duration.
 *
 * It opens on the target, so the common case — you did what you said you would
 * — is a single tap on Done with no adjustment at all. The steppers are for
 * the day it was more or less than that.
 */
export function LogStepper({ value, unit, step, onChange }: LogStepperProps) {
  const [foreground, mutedForeground] = useCSSVariable([
    '--color-foreground',
    '--color-muted-foreground',
  ]);

  const decrement = () => onChange(Math.max(0, Number((value - step).toFixed(2))));
  const increment = () => onChange(Number((value + step).toFixed(2)));

  return (
    <View className="flex-row items-center justify-center gap-4">
      <Touchable
        className="h-11 w-11 items-center justify-center border border-border"
        onPress={decrement}
        haptic="tap"
        disabled={value <= 0}
        accessibilityRole="button"
        accessibilityLabel={`Less ${unit}`}
      >
        <Minus size={18} color={asColor(value <= 0 ? mutedForeground : foreground)} />
      </Touchable>

      <View className="min-w-24 items-center">
        <ThemedText type="displayMd">{format(value)}</ThemedText>
        <ThemedText type="labelSm" color={asColor(mutedForeground)}>
          {unit.toUpperCase()}
        </ThemedText>
      </View>

      <Touchable
        className="h-11 w-11 items-center justify-center border border-border"
        onPress={increment}
        haptic="tap"
        accessibilityRole="button"
        accessibilityLabel={`More ${unit}`}
      >
        <Plus size={18} color={asColor(foreground)} />
      </Touchable>
    </View>
  );
}
