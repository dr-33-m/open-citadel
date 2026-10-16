import React from 'react';
import { View, type TextStyle } from 'react-native';

import { Check } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { cn } from '@/lib/cn';
import type { PlanModel } from '@/stores/subscription';
import { brainName } from '@/utils/plan-name';

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

interface BrainRowProps {
  model: PlanModel;
  active: boolean;
  onSelect: (id: string) => void;
}

/**
 * One brain: its name and maker, and what a typical message on it costs, as
 * a figure at the row's end so the rows compare at a glance down the column.
 * The chosen one is named in gold with a tick. One with no price is out of
 * reach for now, and says so in the figure's place.
 *
 * Memoized on its model and whether it is chosen, so a choice redraws the two
 * rows it changed.
 */
export const BrainRow = React.memo(function BrainRow({ model, active, onSelect }: BrainRowProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const gold = tokens['--color-primary'];
  const select = React.useCallback(() => onSelect(model.id), [onSelect, model.id]);
  const name = brainName(model);
  const forecast = model.forecastCredits;
  const cost = forecast == null ? 'Not available right now' : `about ${forecast} Neurons a message`;

  return (
    <Touchable
      onPress={select}
      haptic="select"
      disabled={forecast == null}
      accessibilityRole="radio"
      accessibilityLabel={`${name}, ${model.provider}, ${cost}`}
      accessibilityState={{ selected: active, disabled: forecast == null }}
      className={cn('flex-row items-center gap-4 py-3.5', forecast == null && 'opacity-50')}
    >
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-1.5">
          <ThemedText type="bodyMd" color={active ? gold : undefined} numberOfLines={1} className="shrink">
            {name}
          </ThemedText>
          {active ? <Check size={16} color={gold} /> : null}
        </View>
        <ThemedText type="bodySm" color={muted} numberOfLines={1}>
          {model.provider}
        </ThemedText>
      </View>
      {forecast == null ? (
        <ThemedText type="labelSm" color={muted}>
          UNAVAILABLE
        </ThemedText>
      ) : (
        <View className="items-end">
          <ThemedText type="headlineSm" style={TABULAR}>
            ≈ {forecast.toLocaleString()}
          </ThemedText>
          <ThemedText type="labelSm" color={muted}>
            NEURONS
          </ThemedText>
        </View>
      )}
    </Touchable>
  );
});
