import React from 'react';
import { View, type TextStyle } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Crown, Feather, ScrollText, type LucideIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { asColor } from '@/utils/colors';
import { cn } from '@/lib/cn';
import type { CreditPlan, PlanId } from 'samwell-shared';

/**
 * The mark each plan goes by.
 *
 * A quill, a scroll, a crown: an order of rank rather than three sizes of the
 * same badge, because the plans differ in what Samwell can think with and not
 * in how much of the same thing you get.
 */
/** Hoisted: a fresh object per render, times three cards, for a value that
 * never changes. */
const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

const PLAN_ICON: Record<PlanId, LucideIcon> = {
  maester: Feather,
  grand_maester: ScrollText,
  archmaester: Crown,
};

export type PlanCardProps = {
  plan: CreditPlan;
  /** How many models this plan opens up. Answered by the server, not counted
   * here: a tier can gain a model without a deploy. */
  modelCount: number;
  /** The store's own price string, which is localised and authoritative. */
  priceLabel: string;
  /** This is the card the carousel is resting on. */
  selected: boolean;
};

/**
 * One plan, as a card.
 *
 * Purely presentational, and deliberately without a button of its own. An
 * earlier draft put a CHOOSE on every card and swapped it between the gold
 * and the plain treatment as the run moved, which was wrong three ways: the
 * two are different components, so every snap unmounted one and mounted the
 * other and the button visibly popped; the gold only caught up on release, so
 * the card growing toward the middle was not yet the highlighted one, which
 * is the opposite of what the in-between frames should be saying; and three
 * buttons all reading "CHOOSE" is three identical announcements to a screen
 * reader.
 *
 * The run selects and one button below commits. Gold then lives in exactly
 * one place and never moves, which is also what the house rule asks for.
 */
export function PlanCard({ plan, modelCount, priceLabel, selected }: PlanCardProps) {
  const [mutedForeground, primary] = useCSSVariable([
    '--color-muted-foreground',
    '--color-primary',
  ]);
  const muted = asColor(mutedForeground);
  const Icon = PLAN_ICON[plan.id];

  return (
    <Card className={cn('h-full gap-4 p-4', selected && 'border-primary')}>
      <View className="flex-row items-center gap-3">
        <PrefixIcon icon={Icon} size={36} color={selected ? asColor(primary) : undefined} />
        <ThemedText type="labelSm" color={selected ? asColor(primary) : muted} numberOfLines={2}>
          {plan.label}
        </ThemedText>
      </View>

      {/* Price and cadence on one baseline: the number is the decision, the
          cadence is the footnote that stops it reading as a one-off. */}
      <View className="flex-row items-baseline gap-2">
        {/* `shrink` and a line cap rather than letting it push the cadence
            off the card: at large type a localised price is long, and the
            slide is a fixed width. */}
        <ThemedText type="headlineLg" numberOfLines={1} className="shrink">
          {priceLabel}
        </ThemedText>
        <ThemedText type="bodySm" color={muted} numberOfLines={1}>
          a month
        </ThemedText>
      </View>

      {/* Three lines of substance, and no feature grid. Every plan has every
          tool, so a tick matrix would be three identical columns arguing they
          are different. */}
      <View className="gap-1">
        <ThemedText type="bodyMd" style={TABULAR} numberOfLines={1}>
          {plan.monthlyCredits.toLocaleString()} AI Credits
        </ThemedText>
        <ThemedText type="bodySm" color={muted} numberOfLines={2}>
          {modelCount} models to choose from
        </ThemedText>
        <ThemedText type="bodySm" color={muted} numberOfLines={2}>
          Unused credits roll over
        </ThemedText>
      </View>

    </Card>
  );
}
