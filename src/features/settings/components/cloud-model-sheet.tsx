import React from 'react';
import { StyleSheet, View, type TextStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { ChevronDown } from '@/components/icons';
import { PageFade } from '@/components/scroll-fades';
import { ThemedText } from '@/components/themed-text';
import { COLLAPSE_DURATION, Collapse } from '@/components/ui/collapse';
import { easingCss } from '@/constants/theme';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import { CREDIT_PLANS, PLAN_ORDER, formatMultiplier, type PlanId } from 'samwell-shared';
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
      className="flex-row items-center gap-3 border-b border-border px-6 py-3"
      onPress={() => onSelect(model.id)}
      haptic="select"
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
          style={SMALL_TABULAR}
          numberOfLines={1}
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

const SMALL_TABULAR: TextStyle = { fontSize: 11, fontVariant: ['tabular-nums'] };

/**
 * A lower tier, folded away.
 *
 * Access is cumulative, so a Grand Maester really can reach the Maester
 * models and there are months where that is the right call. But listing all
 * nine flat buries the three they are paying for among six they are not, and
 * the first row of a flat list is the cheapest model in the cheapest tier -
 * which is the last thing a plan should lead with. Their own three stand
 * open; everything below folds.
 */
function TierSection({
  plan,
  models,
  activeId,
  mutedForeground,
  primary,
  onSelect,
}: {
  plan: PlanId;
  models: PlanModel[];
  activeId: string | null;
  mutedForeground?: string;
  primary?: string;
  onSelect: (id: string) => void;
}) {
  // Opened when the reader's current model lives in here, so a picker never
  // hides the very row it is meant to be showing as chosen.
  const holdsActive = models.some((model) => model.id === activeId);
  const [open, setOpen] = React.useState(holdsActive);

  if (models.length === 0) return null;

  return (
    <View>
      <Touchable
        className="flex-row items-center justify-between gap-3 border-b border-border px-6 py-3"
        onPress={() => setOpen((value) => !value)}
        haptic="tap"
        accessibilityLabel={`${CREDIT_PLANS[plan].label} models, ${open ? 'collapse' : 'expand'}`}
      >
        <ThemedText type="labelSm" color={mutedForeground}>
          ALSO IN {CREDIT_PLANS[plan].label.toUpperCase()}
        </ThemedText>
        {/* Turned with a CSS transition rather than flipped: the panel below
            takes 200ms to open, and a chevron that snaps while it slides
            reads as two unrelated things happening. This is the house tool
            for a two-state change - it runs on the UI thread with no worklet
            and no shared value. */}
        <Animated.View style={[styles.chevron, open ? styles.chevronOpen : styles.chevronShut]}>
          <ChevronDown size={16} color={mutedForeground} />
        </Animated.View>
      </Touchable>
      <Collapse open={open}>
        {models.map((model) => (
          <ModelRow
            key={model.id}
            model={model}
            isActive={model.id === activeId}
            mutedForeground={mutedForeground}
            primary={primary}
            onSelect={onSelect}
          />
        ))}
      </Collapse>
    </View>
  );
}

const styles = StyleSheet.create({
  chevron: {
    transitionProperty: ['transform'],
    transitionDuration: `${COLLAPSE_DURATION}ms`,
    transitionTimingFunction: easingCss,
  },
  chevronShut: { transform: [{ rotate: '0deg' }] },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
});

/**
 * The models this plan reaches.
 *
 * Models above the reader's plan are not listed at all: the plan carousel is
 * where plans are sold, and a picker that mostly cannot be picked from is a
 * worse picker.
 */
export function CloudModelSheet({
  visible,
  onClose,
  onSelect,
  activeId,
  models,
  plan,
  mutedForeground,
  primary,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  activeId: string | null;
  models: PlanModel[];
  /** The reader's plan, which decides what stands open. */
  plan: PlanId | null;
  mutedForeground?: string;
  primary?: string;
}) {
  const held = plan ?? 'maester';

  // Their own tier, and the tiers underneath it, cheapest last.
  const { own, below } = React.useMemo(() => {
    const byPlan = new Map<PlanId, PlanModel[]>();
    for (const model of models) {
      const list = byPlan.get(model.minPlan) ?? [];
      list.push(model);
      byPlan.set(model.minPlan, list);
    }
    const lower = PLAN_ORDER.filter(
      (candidate) => PLAN_ORDER.indexOf(candidate) < PLAN_ORDER.indexOf(held),
    ).reverse();
    return {
      own: byPlan.get(held) ?? [],
      below: lower.map((candidate) => [candidate, byPlan.get(candidate) ?? []] as const),
    };
  }, [models, held]);

  return (
    // `maxHeightRatio` is the cap and the only cap - the sheet measures the
    // content and stops there.
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.85} scrollable>
      <PageFade edges="both" surface="popover">
        <Sheet.ScrollView contentContainerClassName="pb-2">
          <View className="px-6 pb-6">
            <ThemedText type="headlineSm">Choose Model</ThemedText>
          </View>

          {own.map((model) => (
            <ModelRow
              key={model.id}
              model={model}
              isActive={model.id === activeId}
              mutedForeground={mutedForeground}
              primary={primary}
              onSelect={onSelect}
            />
          ))}

          {below.map(([candidate, tierModels]) => (
            <TierSection
              key={candidate}
              plan={candidate}
              models={tierModels}
              activeId={activeId}
              mutedForeground={mutedForeground}
              primary={primary}
              onSelect={onSelect}
            />
          ))}
        </Sheet.ScrollView>
      </PageFade>
    </Sheet>
  );
}
