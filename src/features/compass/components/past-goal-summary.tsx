import React from 'react';
import { View } from 'react-native';
import { Award, CalendarCheck2, CalendarX2, CircleMinus, Coins, MessageCircleHeart, Target } from '@/components/icons';
import { useCSSVariable } from 'uniwind';

import { compact, formatCompassDate } from '@/components/compass/format';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Shimmer } from '@/components/ui/shimmer';
import { Touchable } from '@/components/ui/touchable';
import { LogHeatmapCard } from '@/features/compass/components/log-heatmap-card';
import { useGoalInsights } from '@/features/compass/hooks/use-goal-insights';
import { categoryLabel } from '@/features/compass/utils/category';
import { StatCard } from '@/features/compass/components/stat-card';
import type { PastGoal } from '@/stores/compass';
import { asColor } from '@/utils/colors';

type PastGoalSummaryProps = {
  entry: PastGoal;
  /** Samwell is still writing the takeaway for this one. */
  writingTakeaway: boolean;
  /** Ask again for a takeaway that never arrived. */
  onRetryTakeaway: () => void;
};

/**
 * A goal after it is over.
 *
 * ## Why every number here is frozen
 *
 * Not one figure on this page is recomputed. Consistency is a ratio whose
 * denominator keeps growing — every day after a goal is abandoned adds another
 * occurrence nobody was ever going to log — so a page that recalculated would
 * show a goal getting steadily worse for years after the reader stopped
 * thinking about it. These are the numbers as they stood on the day it ended,
 * which are also the numbers in the reader's journal note about it.
 *
 * The heatmap is the exception, and it is the exception for the same reason:
 * it is not a ratio. It draws which days had logs on them, and that is as true
 * now as it was then.
 *
 * ## Why the takeaway is last
 *
 * A reader arriving here already knows how it went — they lived it. What they
 * cannot get anywhere else is what somebody who watched the whole run makes of
 * it, and putting that first would have Samwell talking over the record before
 * the reader has seen it.
 */
export function PastGoalSummary({
  entry,
  writingTakeaway,
  onRetryTakeaway,
}: PastGoalSummaryProps) {
  const { goal, outcome } = entry;
  const [primary, mutedForeground, bone] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
    '--color-chart-3',
  ]);
  const gold = asColor(primary) ?? '#f2ca50';
  const dim = asColor(mutedForeground);
  const bineutral = asColor(bone) ?? gold;

  const data = useGoalInsights(goal.id);

  const finished = outcome.completed === 1;
  // The same badge the archive row carries, so the row and the page it opens
  // are marked identically.
  const Mark = finished ? Award : CircleMinus;
  const pct =
    outcome.executionRatio == null ? null : Math.round(outcome.executionRatio * 100);
  const hasOutcome =
    outcome.outcomeTarget != null && outcome.outcomeTarget > 0 && outcome.outcomeValue != null;

  return (
    <>
      {/* How it ended, said once and plainly, at the top where the question
          is. The mark repeats the one on the row that was tapped, so the way
          in and the page it opens agree. */}
      <Card>
        <Card.Content className="gap-3 p-4">
          <View className="flex-row items-center gap-2">
            <Mark size={18} color={finished ? gold : dim} strokeWidth={2} />
            <ThemedText type="labelSm" color={finished ? gold : dim}>
              {finished ? 'FINISHED' : 'STOPPED EARLY'}
            </ThemedText>
          </View>

          <ThemedText type="headlineSm">{goal.title}</ThemedText>

          {/* The calendar says which kind of ending this was, beside the dates
              it ran between. */}
          <View className="flex-row items-center gap-1.5">
            {finished ? (
              <CalendarCheck2 size={13} color={dim} strokeWidth={2} />
            ) : (
              <CalendarX2 size={13} color={dim} strokeWidth={2} />
            )}
            <ThemedText type="bodySm" color={dim} className="flex-1">
              {`${categoryLabel(goal.category)} · ran from ${formatCompassDate(
                goal.startDate,
              )} to ${formatCompassDate(outcome.endedOn)}`}
            </ThemedText>
          </View>

          {/* Their own words, kept verbatim and set apart. This is the one
              sentence on the page that no amount of logged data could
              reconstruct, and the reason the abandon dialog asks for it. */}
          {outcome.reason && (
            <View className="border-l-2 border-border pl-3">
              <ThemedText type="bodyMd" color={dim}>
                {outcome.reason}
              </ThemedText>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* The two facts, side by side, exactly as the goal's own page had them
          while it was running: they answer different questions and neither
          follows from the other. No "so far" on either — that framing exists
          because a running goal's number is still being earned, and this one
          is not. */}
      <View className="flex-row gap-3">
        <StatCard
          className="flex-1"
          icon={Target}
          label="CONSISTENCY"
          value={pct == null ? '—' : String(pct)}
          unit={pct == null ? undefined : '%'}
          caption={pct == null ? 'Nothing was ever due' : 'Of what was due'}
          valueColor={bineutral}
        />
        {hasOutcome && (
          <StatCard
            className="flex-1"
            icon={Coins}
            label="REACHED"
            value={compact(outcome.outcomeValue!)}
            unit={outcome.outcomeUnit ?? undefined}
            caption={`Of ${compact(outcome.outcomeTarget!)}`}
            valueColor={gold}
          />
        )}
      </View>

      {/* The record itself, stopped on the day the goal did rather than
          running to today: the days after it ended are not missed days, they
          are days this goal no longer existed. */}
      {data && (
        <LogHeatmapCard
          startDate={goal.startDate}
          endDate={goal.endDate}
          upTo={outcome.endedOn}
          logsByTrackable={data.logsByTrackable}
        />
      )}

      {/* Samwell, last. Written once from the whole run and kept, not
          re-asked: what he made of this goal should not change because the
          sheet was opened twice. */}
      <Card>
        <Card.Content className="gap-3 p-4">
          <View className="flex-row items-center gap-1.5">
            <MessageCircleHeart size={14} color={dim} strokeWidth={2} />
            <ThemedText type="labelSm" color={dim}>
              WHAT SAMWELL TOOK FROM IT
            </ThemedText>
          </View>

          {outcome.takeaway ? (
            <ThemedText type="bodyMd">{outcome.takeaway}</ThemedText>
          ) : writingTakeaway ? (
            // Two bars, one shimmer over the pair. Twenty independently
            // animated skeleton lines is the cost this codebase already paid
            // once.
            <Shimmer as="view">
              <View className="gap-2">
                <View className="h-4 bg-muted" />
                <View className="h-4 w-2/3 bg-muted" />
              </View>
            </Shimmer>
          ) : (
            /* Offered rather than retried on its own. The call fails for
               boring reasons — no signal on the train where you finished the
               goal, the monthly cap — and a card that silently re-fired every
               time it was opened would spend the cap on a page nobody asked a
               question on. */
            <Touchable
              className="items-start"
              onPress={onRetryTakeaway}
              haptic="select"
              accessibilityRole="button"
              accessibilityLabel="Ask Samwell for a takeaway on this goal"
            >
              <ThemedText type="bodySm" color={dim}>
                He has not written one for this goal.
              </ThemedText>
              <ThemedText type="labelSm" color={gold} className="pt-2">
                ASK HIM NOW
              </ThemedText>
            </Touchable>
          )}
        </Card.Content>
      </Card>
    </>
  );
}
