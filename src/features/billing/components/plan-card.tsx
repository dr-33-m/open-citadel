import React from 'react';
import { View, type TextStyle } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Check, ChessPawn, ChessRook, Crown, Info, type LucideIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { Touchable } from '@/components/ui/touchable';
import { asColor } from '@/utils/colors';
import { cn } from '@/lib/cn';
import type { CreditPlan, PlanId } from 'samwell-shared';

/**
 * The mark each plan goes by.
 *
 * A pawn, a rook, a crown: an order of rank rather than three sizes of the
 * same badge, because the plans differ in what Samwell can think with and not
 * in how much of the same thing you get.
 */
/** Hoisted: a fresh object per render, times three cards, for a value that
 * never changes. */
const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

const PLAN_ICON: Record<PlanId, LucideIcon> = {
  maester: ChessPawn,
  grand_maester: ChessRook,
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
  /** Opens the sheet that explains the card's three lines. */
  onInfo: () => void;
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
export function PlanCard({ plan, modelCount, priceLabel, selected, onInfo }: PlanCardProps) {
  const [mutedForeground, primary] = useCSSVariable([
    '--color-muted-foreground',
    '--color-primary',
  ]);
  const muted = asColor(mutedForeground);
  const gold = asColor(primary);
  const Icon = PLAN_ICON[plan.id];

  /*
   * The three lines of substance, derived before the return. Ticks, not bare
   * lines: the onboarding cards made the same promises as rows a reader can
   * run an eye down, and a plan card is the same kind of case for the same
   * kind of list. The credits line leads and reads in tabular figures - it
   * is the number the meter will show.
   */
  const benefits: { label: string; leads: boolean; lines: number }[] = [
    { label: `${plan.monthlyCredits.toLocaleString()} AI Credits`, leads: true, lines: 1 },
    { label: `${modelCount} models to choose from`, leads: false, lines: 2 },
    { label: 'Unused credits roll over', leads: false, lines: 2 },
  ];

  return (
    <Card className={cn('h-full gap-4 p-4', selected && 'border-primary')}>
      {/* The mark that opens the explanation sheet: absolute, top right, the
          mode card's own treatment, so "the i means more about this thing"
          is one convention across the settings screen. A quiet affordance on
          a card that already has a gold story to tell. */}
      <Touchable
        className="absolute right-2 top-2"
        onPress={onInfo}
        haptic="select"
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`About ${plan.label}`}
      >
        <Info size={15} color={muted} />
      </Touchable>

      {/*
       * The name, as a name and not as a label. It opened life as `labelSm` -
       * 11pt, uppercase, tracked - and "GRAND MAESTER SAMWELL" in that dress
       * measured wider than the space beside the badge, drawing clean past
       * the card's edge. Sentence case at `bodySm` fits on one line, and is
       * the pairing the mode cards above it use - badge, then name, then
       * nothing else shouting.
       *
       * The constraint lives on a plain `View` wearing `flex-1`, not on the
       * text itself: Yoga does not shrink a row's children by default, and a
       * text node carrying the flex itself proved willing to keep its
       * intrinsic width anyway (seen on device, one line over the border).
       * A wrapper view is the one structure with nothing clever in it - the
       * text wraps at the width the view actually has. Two lines remain the
       * graceful fallback for a longer localisation, not the expected shape.
       */}
      <View className="flex-row items-center gap-3">
        <PrefixIcon icon={Icon} size={36} color={selected ? gold : undefined} />
        <View className="flex-1">
          <ThemedText type="bodySm" color={selected ? gold : muted} numberOfLines={2}>
            {plan.label}
          </ThemedText>
        </View>
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

      <View className="gap-2">
        {benefits.map((benefit) => (
          <View key={benefit.label} className="flex-row items-start gap-2.5">
            {/* `mt-0.5` optically centres a 14pt glyph on a 20pt line.
                Centring the row would float the tick when a point wraps. The
                tick takes the card's gold when this is the card being decided
                on, so the highlight is one colour telling one story. */}
            <View className="mt-0.5">
              <Check size={14} color={selected ? gold : muted} />
            </View>
            <ThemedText
              type={benefit.leads ? 'bodyMd' : 'bodySm'}
              color={benefit.leads ? undefined : muted}
              style={benefit.leads ? TABULAR : undefined}
              numberOfLines={benefit.lines}
              className="flex-1"
            >
              {benefit.label}
            </ThemedText>
          </View>
        ))}
      </View>

    </Card>
  );
}
