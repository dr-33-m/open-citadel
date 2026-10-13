import React from 'react';
import { View, type TextStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { LucideIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { Touchable } from '@/components/ui/touchable';
import { easing, motion } from '@/constants/theme';
import type { SpendFigure } from '@/features/billing/utils/plan-spend';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { cn } from '@/lib/cn';

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

export interface PlanSpendTileProps {
  icon: LucideIcon;
  /** "BRAINS", "VOICES". */
  label: string;
  /** How far the month goes this way, on the choice being browsed. */
  figure: SpendFigure;
  active: boolean;
  onSelect: () => void;
}

/**
 * One of the two things a month of Neurons goes on, as a tile that is also
 * the tab for it: its name, and how far the whole month would go spent this
 * way. Two of them side by side are the sheet's way of saying one balance
 * pays for both.
 *
 * Drawn as the On-device and Cloud cards are: equal boxes, the chosen one
 * outlined in gold.
 */
export function PlanSpendTile({ icon, label, figure, active, onSelect }: PlanSpendTileProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const tint = active ? tokens['--color-primary'] : muted;

  return (
    <Touchable
      className="flex-1"
      onPress={onSelect}
      haptic="select"
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}: ${figure.value} ${figure.unit}`}
    >
      {/* `flex-1` on the card too, so the two stand as tall as the taller. */}
      <Card className={cn('flex-1 gap-3 p-3', active && 'border-primary')}>
        <View className="flex-row items-center gap-2">
          <PrefixIcon icon={icon} size={28} color={tint} />
          <ThemedText type="labelSm" color={tint}>
            {label}
          </ThemedText>
        </View>
        {/* Keyed on the figure, so browsing fades the new one in rather than flicking to it. */}
        <Animated.View key={figure.value} entering={FadeIn.duration(motion.fast).easing(easing)}>
          <ThemedText type="headlineMd" style={TABULAR}>
            {figure.value}
          </ThemedText>
          <ThemedText type="bodySm" color={muted}>
            {figure.unit}
          </ThemedText>
        </Animated.View>
      </Card>
    </Touchable>
  );
}
