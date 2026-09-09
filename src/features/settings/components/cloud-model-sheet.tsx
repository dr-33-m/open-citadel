import React from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import { formatMultiplier } from 'samwell-shared';
import type { PlanModel } from '@/stores/subscription';

/**
 * One model row.
 *
 * Memoized on primitives, so choosing a model re-renders the two affected
 * rows rather than every model in the list.
 */
const ModelRow = React.memo(function ModelRow({
  model,
  isActive,
  mutedForeground,
  primary,
  onSelect,
}: {
  model: PlanModel;
  isActive: boolean;
  mutedForeground?: string;
  primary?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Touchable
      className="flex-row items-center gap-3 border-b border-border px-4 py-3"
      onPress={() => onSelect(model.id)}
    >
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-baseline justify-between gap-3">
          <ThemedText type="bodyMd" numberOfLines={1} className="flex-1">
            {model.label}
          </ThemedText>
          {/* How dear this one is against the cheapest in its own tier. A
              nudge, never a charge: the credits below are the real cost, and
              the server computes both so the app never sees a price. */}
          <ThemedText type="labelSm" color={mutedForeground}>
            {formatMultiplier(model.multiplier)}
          </ThemedText>
        </View>
        <ThemedText type="labelSm" color={mutedForeground}>
          {model.provider} · {model.capabilities.join(', ')}
        </ThemedText>
        <ThemedText
          type="bodySm"
          color={mutedForeground}
          style={{ fontSize: 11, fontVariant: ['tabular-nums'] }}
        >
          {model.forecastCredits == null
            ? 'Not available right now'
            : `Typical message ≈ ${model.forecastCredits} credits`}
        </ThemedText>
      </View>
      {isActive && <ThemedText type="bodyMd" color={primary}>✓</ThemedText>}
    </Touchable>
  );
});

/**
 * The models this plan reaches.
 *
 * Only the models the reader has actually paid for are listed. A model above
 * their plan is not shown greyed out with an upsell on it: the plan carousel
 * is where plans are sold, and a picker that mostly cannot be picked from is
 * a worse picker.
 */
export function CloudModelSheet({
  visible,
  onClose,
  onSelect,
  activeId,
  models,
  mutedForeground,
  primary,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  activeId: string | null;
  models: PlanModel[];
  mutedForeground?: string;
  primary?: string;
}) {
  /*
   * `onSelect` arrives as an inline arrow from the call site, so it cannot
   * key the memoized rows directly. It rides in through a ref instead - taps
   * land after commit, so the effect-synced ref never misses.
   */
  const onSelectRef = React.useRef(onSelect);
  React.useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const handleSelect = React.useCallback((id: string) => {
    onSelectRef.current(id);
  }, []);

  const renderItem = React.useCallback(
    ({ item }: { item: PlanModel }) => (
      <ModelRow
        model={item}
        isActive={item.id === activeId}
        mutedForeground={mutedForeground}
        primary={primary}
        onSelect={handleSelect}
      />
    ),
    [activeId, mutedForeground, primary, handleSelect],
  );

  return (
    // `maxHeightRatio` is the cap and the only cap - the sheet measures the
    // list and stops there, so it needs no `maxHeight` of its own.
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.8} scrollable>
      <Sheet.FlatList
        data={models}
        keyExtractor={(model) => model.id}
        ListHeaderComponent={
          <View className="flex-row items-center justify-between px-6 pb-6">
            <ThemedText type="headlineSm">Choose Model</ThemedText>
          </View>
        }
        renderItem={renderItem}
      />
    </Sheet>
  );
}
