import React from 'react';
import { ScrollView, View } from 'react-native';
import { Coins, Target } from '@/components/icons';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { RowFade } from '@/components/scroll-fades';
import { Card } from '@/components/ui/card';
import { Touchable } from '@/components/ui/touchable';
import { Progress } from '@/components/ui/progress';
import { LineChart } from '@/components/ui/line-chart';
import { RingChart } from '@/components/ui/ring-chart';
import {
  compact,
  consistencyScore,
  consistencyTone,
  formatCompassDate,
  paceTone,
  toneColor,
} from '@/components/compass/format';
import { LogHeatmapCard } from '@/features/compass/components/log-heatmap-card';
import { StatCard } from '@/features/compass/components/stat-card';
import { buildOutcomeSeries } from '@/features/compass/utils/outcome-series';
import type { LogView, TrackableView } from '@/services/occurrences';
import type { GoalConsistency, GoalRow } from '@/stores/compass';
import { useToday } from '@/hooks/use-today';
import { asColor } from '@/utils/colors';
import { daysBetween } from '@/utils/day';

type InsightsBodyProps = {
  goal: GoalRow | null;
  consistency: GoalConsistency | null;
  trackables: TrackableView[];
  logsByTrackable: Map<string, LogView[]>;
};

/**
 * One goal's record, as the Insights screens read it: what the goal is, how
 * it is going overall, the two headline numbers, and the day-by-day shape.
 *
 * Everything here sits in a card, and that is doing work rather than
 * decoration: these are four different KINDS of claim, and running them
 * together as a column of text leaves the reader to do the grouping. A number
 * that matters gets a tray of its own.
 *
 * Extracted so two surfaces render the same view: the single-goal Insights
 * sheet, and a goal's tab inside the multi-goal overview.
 *
 * Execution and outcome sit side by side because the whole point is that they
 * are different facts and neither explains the other. You can be 92% consistent
 * and a quarter of the way to $4,000; stacking them in one column invites the
 * reading that the second follows from the first.
 */
export function InsightsBody({
  goal,
  consistency,
  trackables,
  logsByTrackable,
}: InsightsBodyProps) {
  const [primary, mutedForeground, bone] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
    '--color-chart-3',
  ]);
  const gold = asColor(primary) ?? '#f2ca50';
  const dim = asColor(mutedForeground);
  // Two neutral colours, so the rings stay tellable apart while both are
  // ordinary — which is most of the time, now that red and green are reserved.
  const neutralOutcome = gold;
  const neutralExecution = asColor(bone) ?? gold;

  // State, not a read: a card counting down to a date has to notice the date
  // changing under it. See `useToday`.
  const today = useToday();
  const execution = consistency?.execution ?? null;
  const outcome = consistency?.outcome ?? null;

  /**
   * The outcome's run against the pace the schedule asks for, on goals that
   * carry a number.
   *
   * Empty for a purely behavioural goal — a cold shower has no y-axis — which
   * is what decides whether the card below is drawn at all.
   */
  const pace = React.useMemo(
    () => (goal ? buildOutcomeSeries(goal, trackables, logsByTrackable, today) : []),
    [goal, trackables, logsByTrackable, today],
  );

  /**
   * How far through the goal's own calendar we are, 0..1.
   *
   * This is what makes red mean something: a goal three weeks into four months
   * at 14% of its money is early, not failing, and only the clock can tell the
   * two apart.
   */
  const elapsed = React.useMemo(() => {
    if (!goal) return 0;
    const span = daysBetween(goal.startDate, goal.endDate);
    if (span <= 0) return 1;
    return Math.min(1, Math.max(0, daysBetween(goal.startDate, today) / span));
  }, [goal, today]);

  const outcomeRatio =
    outcome && outcome.target > 0 ? outcome.value / outcome.target : null;
  const outcomeTone = paceTone(outcomeRatio, elapsed);
  // A consistency ratio is already measured against what was due to date, so
  // comparing it to the calendar again would double-count the pace. Held
  // neutral until enough has come due to judge — see `consistencyTone`.
  const executionTone = consistencyTone(execution);

  // Outermost ring is the outcome, inner is execution. Both coloured by score
  // psychology rather than the series ramp: these are judgements about how it
  // is going, not categories being told apart.
  const rings = React.useMemo(() => {
    const data: { label: string; value: number; maxValue: number; color?: string }[] = [];
    if (outcome) {
      data.push({
        label: 'Outcome',
        value: outcome.value,
        maxValue: outcome.target,
        color: toneColor(outcomeTone, neutralOutcome),
      });
    }
    data.push({
      label: 'Consistency',
      value: execution?.completed ?? 0,
      maxValue: Math.max(1, execution?.expected ?? 1),
      color: toneColor(executionTone, neutralExecution),
    });
    return data;
  }, [outcome, execution, outcomeTone, executionTone, neutralOutcome, neutralExecution]);

  /**
   * Which ring is held, or -1 for none.
   *
   * Controlled here rather than left to the chart, because the legend below is
   * ours now and the two have to agree: tapping a legend row has to dim the
   * other arc exactly as tapping the arc does, or the card has two different
   * ideas about what is selected.
   */
  const [activeRing, setActiveRing] = React.useState(-1);

  const executionScore = consistencyScore(execution);
  const daysLeft = goal ? Math.max(0, daysBetween(today, goal.endDate)) : 0;

  return (
    <>
      {/* What this is. Its own tray, so the title is not competing with a
          number for the top of the sheet. */}
      <Card>
        <Card.Content className="gap-3 p-4">
          <ThemedText type="headlineSm">{goal?.title ?? 'No goal yet'}</ThemedText>
          {goal && (
            <View className="gap-2">
              {/* The dates as a bar rather than a sentence: how much of the
                  run is gone is the thing this card is actually saying, and a
                  length says it faster than "120 days left" does. Gold,
                  because this is the goal's own clock on the goal's own card;
                  it is not a judgement, so none of the pace tones apply. */}
              <Progress
                value={Math.round(elapsed * 100)}
                color="primary"
                size="md"
                accessibilityLabel={`${daysLeft} days left, through ${formatCompassDate(
                  goal.endDate,
                )}`}
              />
              {/* Below the bar. `Progress` only draws its own labels above
                  it, and above is where the title already is. */}
              <View className="flex-row items-center justify-between gap-3">
                <ThemedText type="labelSm" color={dim}>
                  {`${daysLeft} ${daysLeft === 1 ? 'DAY' : 'DAYS'} LEFT`}
                </ThemedText>
                <ThemedText type="labelSm" color={dim}>
                  {formatCompassDate(goal.endDate).toUpperCase()}
                </ThemedText>
              </View>
            </View>
          )}
        </Card.Content>
      </Card>

      {goal && (
        <>
          <Card>
            <Card.Content className="gap-3 p-4">
              <View className="flex-row items-baseline justify-between gap-3">
                <ThemedText type="labelSm" color={dim}>
                  PROGRESS
                </ThemedText>
                <ThemedText type="labelSm" color={dim}>
                  TAP A RING
                </ThemedText>
              </View>
              {/* Legend INSIDE the chart: every part reads the ring data
                  off `RingChart`'s own context, so a sibling throws. */}
              <View className="items-center py-1">
                <RingChart
                  data={rings}
                  size={190}
                  strokeWidth={12}
                  ringGap={5}
                  activeIndex={activeRing}
                  onActiveIndexChange={setActiveRing}
                >
                  {rings.map((_, index) => (
                    // Butt caps against the component's own default of round.
                    // Every corner in this app is square, and a ring is the
                    // largest thing on screen to get that wrong.
                    <RingChart.Ring key={index} index={index} lineCap="butt" />
                  ))}
                  <RingChart.Center />
                </RingChart>
              </View>

              {/* Our own legend, below the chart rather than
                  `RingChart.Legend` inside it. The component's version is
                  laid out within the chart's own box, so it sits on top of
                  the arcs however much margin it is given — and the numbers
                  are the readable part, so they cannot be drawn over the
                  drawing they explain. */}
              <View className="gap-2">
                {rings.map((ring, index) => {
                  const pct =
                    ring.maxValue > 0 ? Math.round((ring.value / ring.maxValue) * 100) : 0;
                  // Nothing held means everything reads at full strength;
                  // holding one dims the rest, so the row and its arc are
                  // obviously the same thing.
                  const dimmed = activeRing !== -1 && activeRing !== index;
                  return (
                    <Touchable
                      key={ring.label}
                      className="py-0.5"
                      onPress={() => setActiveRing(activeRing === index ? -1 : index)}
                      haptic="select"
                      accessibilityRole="button"
                      accessibilityState={{ selected: activeRing === index }}
                      accessibilityLabel={
                        `${ring.label}, ${pct} percent`
                      }
                    >
                      {/* The dim lives on an inner view, not on the
                          Touchable: `AnimatedPressable` drives its own
                          press opacity as an animated style, which wins over
                          a static one set on the same node — so the row
                          never dimmed with its arc. */}
                      <View
                        className="flex-row items-center justify-between gap-3"
                        style={{ opacity: dimmed ? 0.35 : 1 }}
                      >
                        <View className="flex-row items-center gap-2">
                          <View
                            style={{ width: 8, height: 8, backgroundColor: ring.color }}
                          />
                          <ThemedText type="bodySm">{ring.label}</ThemedText>
                        </View>
                        <ThemedText type="labelMd" color={ring.color}>
                          {`${pct}%`}
                        </ThemedText>
                      </View>
                    </Touchable>
                  );
                })}
              </View>
            </Card.Content>
          </Card>

          <View className="flex-row gap-4">
            <StatCard
              className="flex-1"
              icon={Target}
              label="CONSISTENCY"
              value={executionScore == null ? '—' : String(executionScore)}
              unit={executionScore == null ? undefined : '%'}
              valueColor={toneColor(executionTone, neutralExecution)}
              /* "so far" is what makes the number honest, and it is all this
                 needed. A bare 100% reads as finished; consistency is measured
                 against what has already come due, so it says nothing has
                 slipped YET. Naming the denominator says that in three words,
                 where withholding the figure said it in none. */
              caption={
                execution && execution.expected > 0
                  ? `${execution.completed} of ${execution.expected} so far`
                  : 'Too early to say'
              }
            />
            <StatCard
              className="flex-1"
              icon={Coins}
              label="OUTCOME"
              value={outcome ? compact(outcome.value) : '—'}
              unit={outcome ? `of ${compact(outcome.target)}` : undefined}
              valueColor={outcome ? toneColor(outcomeTone, neutralOutcome) : undefined}
              /* Three different states, and they are not the same news. A
                 goal with no number never wanted one; a goal whose number no
                 trackable feeds wanted one and is not going to get it, which
                 is something to fix rather than something to accept. */
              caption={
                outcome
                  ? outcome.unit
                  : goal.outcomeUnit
                    ? `Nothing tracked in ${goal.outcomeUnit}`
                    : 'This goal has no number'
              }
            />
          </View>

          {/* The outcome against an even pace, for a goal that carries a
              number. This is the only thing on the card that answers "am I on
              track": the ring and the stat both say 2 of 100, which is fine in
              week one and a disaster in week eleven, and only the distance
              between these two lines tells them apart.

              Above the grid, because it is about the target and the grid is
              about the habit — the same order the two stat cards are in. */}
          {pace.length > 1 && outcome && (
            <Card>
              <Card.Content className="gap-3 p-4">
                <View className="flex-row items-baseline justify-between gap-3">
                  <ThemedText type="labelSm" color={dim}>
                    PACE TO TARGET
                  </ThemedText>
                  <ThemedText type="labelSm" color={dim}>
                    {`${compact(outcome.target)} ${outcome.unit.toUpperCase()}`}
                  </ThemedText>
                </View>

                <LineChart data={pace} xDataKey="label" aspectRatio={1.8} curve="linear">
                  <LineChart.Grid rows={3} />
                  {/* Dashed and second, so actual and target are told apart by
                      shape as well as by colour — the chart still reads with
                      the gold and the bone at the same lightness. */}
                  <LineChart.Line dataKey="pace" colorIndex={3} strokeWidth={1.5} dashArray="5,5" />
                  <LineChart.Area dataKey="actual" colorIndex={1} />
                  <LineChart.Line dataKey="actual" colorIndex={1} />
                  <LineChart.XAxis ticks={4} />
                </LineChart>

                <View className="flex-row items-center justify-end gap-3">
                  <View className="flex-row items-center gap-1.5">
                    <View style={{ width: 10, height: 3, backgroundColor: gold }} />
                    <ThemedText type="labelSm" color={dim}>
                      LOGGED
                    </ThemedText>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <View style={{ width: 10, height: 3, backgroundColor: dim, opacity: 0.7 }} />
                    <ThemedText type="labelSm" color={dim}>
                      IDEAL PACE
                    </ThemedText>
                  </View>
                </View>
              </Card.Content>
            </Card>
          )}

          <LogHeatmapCard
            startDate={goal.startDate}
            endDate={goal.endDate}
            upTo={today}
            logsByTrackable={logsByTrackable}
          />

          {/* Only worth its own section with more than one trackable —
              otherwise it just restates the goal's execution number. */}
          {execution && execution.breakdown.length > 1 && (
            <View className="gap-2">
              <ThemedText type="labelSm" color={dim}>
                BY ACTIVITY
              </ThemedText>
              {/* Sideways, because a goal can carry five of these and a
                  stacked column would push the heatmap off the screen. Worst
                  first, so the thing to fix is the thing you land on. */}
              {/* Full-bleed, cancelling the sheet's gutter, and the cards
                  are narrow enough that the next one is always cut by the
                  screen edge. A row that ends flush looks like a row that
                  has ended — the peek is what says there is more, and the
                  fade over it is what says it scrolls. */}
              <View className="-mx-4">
                <RowFade surface="popover">
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerClassName="gap-3 px-4"
                  >
                {execution.breakdown.map((result) => {
                  const score = consistencyScore(result);
                  return (
                    <StatCard
                      key={result.trackableId}
                      className="w-36"
                      label={result.title.toUpperCase()}
                      value={score == null ? '—' : String(score)}
                      unit={score == null ? undefined : '%'}
                      valueColor={toneColor(consistencyTone(result), neutralExecution)}
                      caption={
                        result.expected === 0
                          ? 'Nothing due yet'
                          : `${result.completed} of ${result.expected} so far`
                      }
                    />
                  );
                    })}
                  </ScrollView>
                </RowFade>
              </View>
            </View>
          )}
        </>
      )}

      {goal && trackables.length === 0 && (
        <ThemedText type="bodySm" color={dim}>
          Nothing is being tracked yet.
        </ThemedText>
      )}
    </>
  );
}
