import React from 'react';
import { View } from 'react-native';
import { ChevronRight, Coins, Star, Target, TrendingDown } from '@/components/icons';
import type { LucideIcon } from '@/components/icons';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import {
  compact,
  consistencyScore,
  consistencyTone,
  formatCompassDate,
  paceTone,
  toneColor,
} from '@/components/compass/format';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Touchable } from '@/components/ui/touchable';
import { categoryLabel } from '@/features/compass/utils/category';
import type { GoalConsistency, GoalRow } from '@/stores/compass';
import { asColor } from '@/utils/colors';
import { daysBetween, type Ymd } from '@/utils/day';

type OverviewMainGoalProps = {
  goal: GoalRow;
  consistency: GoalConsistency | null;
  /** The sheet's clock, so the card counts down without keeping its own. */
  today: Ymd;
  /**
   * What is beating this goal, already worded — the leader's title when one
   * side goal is ahead, a count when several are. Null when nothing is, which
   * is most days and is why the band below is not always drawn.
   */
  outpacedBy: string | null;
  onOpen: () => void;
};

/**
 * One figure inside the hero, shaped like `StatCard` without its card.
 *
 * The shape is worth copying — small label, figure at display size, caption
 * underneath — but the surface is not: this already sits on a card, and
 * DESIGN.md has no third level to put another one on. Two of these against a
 * hairline is the same "two facts, neither explains the other" the Insights
 * page makes with two cards, at the size the hero can afford.
 */
function HeroFigure({
  icon: Icon,
  label,
  value,
  unit,
  caption,
  valueColor,
  dim,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  caption: string;
  valueColor?: string;
  dim?: string;
}) {
  return (
    <View className="flex-1 gap-1">
      {/* Icon then label, at `StatCard`'s size and weight: this is the same
          pair of figures the goal's own Insights draws, so the reader should
          not have to work out that they are the same pair. */}
      <View className="flex-row items-center gap-1.5">
        <Icon size={14} color={dim} strokeWidth={2} />
        <ThemedText type="labelSm" color={dim} numberOfLines={1}>
          {label}
        </ThemedText>
      </View>
      <View className="flex-row items-baseline gap-1">
        <ThemedText type="displayMd" color={valueColor}>
          {value}
        </ThemedText>
        {unit && (
          <ThemedText type="bodyMd" color={dim}>
            {unit}
          </ThemedText>
        )}
      </View>
      <ThemedText type="bodySm" color={dim} numberOfLines={2}>
        {caption}
      </ThemedText>
    </View>
  );
}

/**
 * The main goal, at the top of the overview, given the weight it claims.
 *
 * Compass says one goal is where the prize is, and the overview used to list
 * it in a box identical to every other one, told apart by a 13pt star. This is
 * that claim made visible: it opens the screen, it is the only thing here at
 * headline size, and it carries the clock and the two numbers the way the
 * single-goal Insights view does.
 *
 * Both numbers are LABELLED, which is the defect this replaces. The old row
 * put a 50% execution meter directly above a "2 of 100 · 2%" caption with
 * nothing saying which was which, so the card showed two percentages that
 * disagreed and left the reader to guess. Consistency and outcome are different
 * facts and neither explains the other, so they sit side by side with their
 * own names, exactly as the Insights page presents them.
 */
export function OverviewMainGoal({
  goal,
  consistency,
  today,
  outpacedBy,
  onOpen,
}: OverviewMainGoalProps) {
  const [primary, mutedForeground, bone, destructive] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
    '--color-chart-3',
    '--color-destructive',
  ]);
  const gold = asColor(primary) ?? '#f2ca50';
  const dim = asColor(mutedForeground);
  const neutralExecution = asColor(bone) ?? gold;
  const danger = asColor(destructive);

  const execution = consistency?.execution ?? null;
  const outcome = consistency?.outcome ?? null;

  /** How far through the goal's own calendar we are, 0..1. */
  const elapsed = React.useMemo(() => {
    const span = daysBetween(goal.startDate, goal.endDate);
    if (span <= 0) return 1;
    return Math.min(1, Math.max(0, daysBetween(goal.startDate, today) / span));
  }, [goal.startDate, goal.endDate, today]);

  const daysLeft = Math.max(0, daysBetween(today, goal.endDate));
  const executionScore = consistencyScore(execution);
  const outcomeRatio = outcome && outcome.target > 0 ? outcome.value / outcome.target : null;
  // Only the outcome is read against the clock. A consistency ratio is already
  // measured against what was due to date, so judging it by the calendar again
  // would count the pace twice.
  const executionColor = toneColor(consistencyTone(execution), neutralExecution);
  const outcomeColor = toneColor(paceTone(outcomeRatio, elapsed), gold);

  return (
    <Touchable
      onPress={onOpen}
      haptic="select"
      accessibilityRole="button"
      accessibilityLabel={`Main goal in ${categoryLabel(goal.category)}, ${goal.title}. ${
        executionScore == null ? 'Consistency not yet measurable' : `Consistency ${executionScore}%`
      }. ${daysLeft} days left. Opens this goal.`}
    >
      <Card>
        <Card.Content className="gap-3 p-4">
          <View className="flex-row items-center gap-1.5">
            <Star size={11} color={gold} fill={gold} />
            {/* The category rides on the label the card already had. It is
                what ties this goal to a spoke of the radar below, which is
                named by category and not by goal — without it the shape says
                "Career is at 50%" while the list says "TikTok videos is at
                50%" and the reader has to work out that those are one fact. */}
            <ThemedText type="labelSm" color={gold} className="flex-1" numberOfLines={1}>
              {`${categoryLabel(goal.category).toUpperCase()} · MAIN GOAL`}
            </ThemedText>
            <ChevronRight size={16} color={dim} strokeWidth={2} />
          </View>

          {/* Two lines, not one. This is the only headline on the screen and
              a real goal title is a sentence: eliding it to keep the card
              short would hide the half that says which goal it is. */}
          <ThemedText type="headlineSm" numberOfLines={2}>
            {goal.title}
          </ThemedText>

          <View className="gap-2">
            {/* The run, as a length rather than a sentence. Gold because it is
                the goal's own clock and not a judgement about it. */}
            <Progress
              value={Math.round(elapsed * 100)}
              color="primary"
              size="md"
              accessibilityLabel={`${daysLeft} days left, through ${formatCompassDate(
                goal.endDate,
              )}`}
            />
            <View className="flex-row items-center justify-between gap-3">
              <ThemedText type="labelSm" color={dim}>
                {`${daysLeft} ${daysLeft === 1 ? 'DAY' : 'DAYS'} LEFT`}
              </ThemedText>
              <ThemedText type="labelSm" color={dim}>
                {formatCompassDate(goal.endDate).toUpperCase()}
              </ThemedText>
            </View>
          </View>

          <View className="flex-row gap-4 border-t border-border pt-3">
            <HeroFigure
              icon={Target}
              label="CONSISTENCY"
              value={executionScore == null ? '—' : String(executionScore)}
              unit={executionScore == null ? undefined : '%'}
              valueColor={executionColor}
              dim={dim}
              caption={
                execution && execution.expected > 0
                  ? `${execution.completed} of ${execution.expected} so far`
                  : 'Too early to say'
              }
            />
            <View className="w-px bg-border" />
            <HeroFigure
              icon={Coins}
              label="OUTCOME"
              value={outcome ? compact(outcome.value) : '—'}
              unit={outcome ? `of ${compact(outcome.target)}` : undefined}
              valueColor={outcome ? outcomeColor : undefined}
              dim={dim}
              caption={
                outcome
                  ? outcome.unit
                  : goal.outcomeUnit
                    ? `Nothing tracked in ${goal.outcomeUnit}`
                    : 'No number on this one'
              }
            />
          </View>

        </Card.Content>

        {/* The lean signal, as a band set into the foot of the card.

            It belongs to this goal — it is the one fact here that is about
            the goal's standing rather than its numbers — so it lives on the
            goal's card and not in one of its own, where it restated both
            percentages a third time. As a loose line under the figures it
            read as an afterthought with nothing holding it; `panel` is the
            house treatment for a band the card is saying something WITH
            rather than more of what it says, and the rule and the darker step
            are what give it somewhere to sit. */}
        {outpacedBy && (
          <Card.Footer variant="panel" className="items-start gap-2 p-4">
            {/* Down and red, because the band is about THIS goal and this
                goal is the one losing ground. Pointing the arrow up at the
                side goal that is winning read as praise for it, on the main
                goal's own card. Red is the app's judgement colour and this is
                a judgement — the one place in Compass that says out loud that
                the prize is being left behind. */}
            <TrendingDown size={14} color={danger} strokeWidth={2} />
            <ThemedText type="bodySm" color={dim} className="flex-1">
              {`${outpacedBy} ahead of this one.`}
            </ThemedText>
          </Card.Footer>
        )}
      </Card>
    </Touchable>
  );
}
