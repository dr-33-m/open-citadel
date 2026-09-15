import React from 'react';
import { View } from 'react-native';
import type { LucideIcon } from '@/components/icons';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { asColor } from '@/utils/colors';

type StatCardProps = {
  icon?: LucideIcon;
  label: string;
  /** The number itself, already formatted. Carries the weight. */
  value: string;
  /** The unit, set smaller and on the same baseline: `45`min, `1,000`kcal. */
  unit?: string;
  caption?: string;
  /** Colours the number when it is a judgement rather than a fact. */
  valueColor?: string;
  className?: string;
};

/**
 * One number, dressed.
 *
 * The shape is Apple's: a small labelled row on top, then the figure at
 * display size with its unit tucked in beside it at body size. The reason it
 * works is the size gap — the eye lands on the number first and reads the
 * label only if it needs to, which is the opposite of a line of plain text
 * where the label and the value carry the same weight and neither wins.
 *
 * The unit sits on the number's own baseline rather than under it, so `45min`
 * reads as one quantity instead of two facts stacked.
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  caption,
  valueColor,
  className,
}: StatCardProps) {
  const mutedForeground = useCSSVariable('--color-muted-foreground');
  const muted = asColor(mutedForeground);

  return (
    <Card className={className}>
      <Card.Content className="gap-2 p-4">
        <View className="flex-row items-center gap-1.5">
          {Icon && <Icon size={14} color={muted} strokeWidth={2} />}
          <ThemedText type="labelSm" color={muted} numberOfLines={1}>
            {label}
          </ThemedText>
        </View>

        <View className="flex-row items-baseline gap-1">
          <ThemedText type="displayMd" color={valueColor}>
            {value}
          </ThemedText>
          {unit && (
            <ThemedText type="bodyMd" color={muted}>
              {unit}
            </ThemedText>
          )}
        </View>

        {caption && (
          <ThemedText type="bodySm" color={muted} numberOfLines={2}>
            {caption}
          </ThemedText>
        )}
      </Card.Content>
    </Card>
  );
}
