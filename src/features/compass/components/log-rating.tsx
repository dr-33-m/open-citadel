import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { asColor } from '@/utils/colors';

type LogRatingProps = {
  min: number;
  max: number;
  value: number | null;
  onChange: (next: number) => void;
};

/**
 * A row of square cells, one per point on the scale.
 *
 * Squares rather than stars. Stars are decoration, they carry a built-in
 * suggestion that more is better, and the house vocabulary for a mark is a
 * square anyway. Nothing is preselected: a rating the user did not choose is
 * not a rating.
 */
export function LogRating({ min, max, value, onChange }: LogRatingProps) {
  const [primary, primaryForeground, foreground] = useCSSVariable([
    '--color-primary',
    '--color-primary-foreground',
    '--color-foreground',
  ]);

  const points: number[] = [];
  for (let point = min; point <= max; point += 1) points.push(point);

  return (
    <View className="flex-row items-center justify-center gap-2">
      {points.map((point) => {
        const selected = value === point;
        return (
          <Touchable
            key={point}
            className="h-12 w-12 items-center justify-center border border-border"
            style={
              selected
                ? { borderColor: asColor(primary), backgroundColor: asColor(primary) }
                : undefined
            }
            onPress={() => onChange(point)}
            haptic="tap"
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${point} out of ${max}`}
          >
            <ThemedText
              type="bodyMd"
              color={asColor(selected ? primaryForeground : foreground)}
            >
              {point}
            </ThemedText>
          </Touchable>
        );
      })}
    </View>
  );
}
