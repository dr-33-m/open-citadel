import React from 'react';
import { View, type TextStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { CreditPlan } from 'samwell-shared';

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

export interface PlanNeuronsProps {
  plan: CreditPlan;
  /** The plan reads aloud as well as thinks, so the balance has two uses to name. */
  shared: boolean;
}

/**
 * What a plan grants each month: the one figure everything else in its sheet
 * is spent from. It says in a line that the balance is one, and carries the
 * rollover as a supporting row, a limit on this figure and not a second hero.
 */
export function PlanNeurons({ plan, shared }: PlanNeuronsProps) {
  const muted = useThemeTokens()['--color-muted-foreground'];

  return (
    <View className="gap-3 border-y border-surface-tertiary py-4">
      <View className="gap-1">
        <ThemedText type="labelSm" color={muted}>
          MONTHLY NEURONS
        </ThemedText>
        <View className="flex-row items-baseline gap-2">
          <ThemedText type="headlineLg" style={TABULAR}>
            {plan.monthlyCredits.toLocaleString()}
          </ThemedText>
          <ThemedText type="bodySm" color={muted}>
            Neurons
          </ThemedText>
        </View>
        <ThemedText type="bodySm" color={muted}>
          {shared ? "One balance for Samwell's brains and cloud voices." : 'Stronger brains use more Neurons.'}
        </ThemedText>
      </View>
      <View className="flex-row items-baseline justify-between gap-3 border-t border-surface-tertiary pt-3">
        <ThemedText type="labelSm" color={muted}>
          UNUSED ROLL OVER
        </ThemedText>
        <ThemedText type="bodySm" style={TABULAR}>
          up to {plan.rolloverCap.toLocaleString()}
        </ThemedText>
      </View>
    </View>
  );
}
