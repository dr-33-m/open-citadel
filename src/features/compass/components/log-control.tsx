import React from 'react';
import { TextInput, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { Measurement } from 'samwell-shared';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { fontFamily } from '@/constants/theme';
import { LogRating } from '@/features/compass/components/log-rating';
import { LogStepper } from '@/features/compass/components/log-stepper';
import { asColor } from '@/utils/colors';

type LogControlProps = {
  measurement: Measurement;
  value: number | null;
  onChange: (next: number | null) => void;
};

/** Minutes move in fives; hours in halves. Nobody logs 37 minutes on purpose. */
function stepFor(unit: 'minutes' | 'hours'): number {
  return unit === 'hours' ? 0.5 : 5;
}

/**
 * How one card asks what happened, by measurement type.
 *
 * COMPLETION has no control at all: the Done button IS the input, and adding a
 * checkbox above it would ask the same question twice.
 */
export function LogControl({ measurement, value, onChange }: LogControlProps) {
  const [mutedForeground, foreground] = useCSSVariable([
    '--color-muted-foreground',
    '--color-foreground',
  ]);

  switch (measurement.type) {
    case 'COMPLETION':
      return null;

    case 'QUANTITY':
      return (
        <LogStepper
          value={value ?? measurement.target}
          unit={measurement.unit}
          step={1}
          onChange={onChange}
        />
      );

    case 'DURATION':
      return (
        <View className="gap-3">
          <LogStepper
            value={value ?? measurement.target}
            unit={measurement.unit}
            step={stepFor(measurement.unit)}
            onChange={onChange}
          />
          {/* Numbers only, and each takes an equal share of the row. Spelling
              the unit out on all three overflowed the card, and the stepper
              directly above already says what the number is counting. */}
          <View className="flex-row gap-2">
            {[0.5, 1, 1.5].map((multiple) => {
              const preset = Number((measurement.target * multiple).toFixed(2));
              return (
                <Touchable
                  key={multiple}
                  className="flex-1 items-center border border-border py-2"
                  onPress={() => onChange(preset)}
                  haptic="tap"
                  accessibilityRole="button"
                  accessibilityLabel={`${preset} ${measurement.unit}`}
                >
                  <ThemedText type="labelSm" color={asColor(mutedForeground)}>
                    {String(preset)}
                  </ThemedText>
                </Touchable>
              );
            })}
          </View>
        </View>
      );

    case 'AMOUNT':
      // Money starts empty. An amount is rarely exactly the target, and
      // prefilling one would make the default the data.
      return (
        <View className="flex-row items-center justify-center gap-2 border border-border px-4 py-3">
          <ThemedText type="headlineSm" color={asColor(mutedForeground)}>
            {measurement.unit}
          </ThemedText>
          <TextInput
            className="min-w-24 flex-1"
            style={{ fontFamily: fontFamily.serifBold, fontSize: 28, color: asColor(foreground) }}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={asColor(mutedForeground)}
            value={value == null ? '' : String(value)}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9.]/g, '');
              const parsed = Number.parseFloat(cleaned);
              onChange(cleaned === '' || Number.isNaN(parsed) ? null : parsed);
            }}
            accessibilityLabel={`Amount in ${measurement.unit}`}
          />
        </View>
      );

    case 'RATING':
      return (
        <LogRating
          min={measurement.min}
          max={measurement.max}
          value={value}
          onChange={onChange}
        />
      );

    default:
      return null;
  }
}
