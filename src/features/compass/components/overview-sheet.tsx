import React from 'react';
import { View } from 'react-native';
import { Star, Target } from '@/components/icons';
import { useCSSVariable } from 'uniwind';

import { GOAL_CATEGORIES, type GoalCategory } from 'samwell-shared';

import { ThemedText } from '@/components/themed-text';
import { paceTone, toneColor } from '@/components/compass/format';
import { PageFade } from '@/components/scroll-fades';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { RadarChart } from '@/components/ui/radar-chart';
import { Sheet } from '@/components/ui/sheet';
import { Tabs } from '@/components/ui/tabs';
import { OverviewSkeleton } from '@/components/skeletons/compass-skeletons';
import { GoalDot } from '@/features/compass/components/goal-dot';
import { InsightsBody } from '@/features/compass/components/insights-body';
import { OverviewGoalRow } from '@/features/compass/components/overview-goal-row';
import { categoryLabel } from '@/features/compass/utils/category';
import { useGoalInsights } from '@/features/compass/hooks/use-goal-insights';
import { leanSignal } from '@/services/consistency';
import type { GoalConsistency, GoalRow } from '@/stores/compass';
import { asColor } from '@/utils/colors';

type OverviewSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** The active goals, primary first — at most five. */
  goals: GoalRow[];
  primaryGoalId: string | null;
  consistencyByGoal: Map<string, GoalConsistency>;
  /** Point the whole of Compass at another goal. */
  onSelectGoal: (goalId: string) => void;
  /** Move the primary mark. */
  onMakePrimary: (goalId: string) => void;
};

const SNAP_RATIOS = [0.62, 0.95];
const OVERVIEW_TAB = 'overview';

/**
 * Tab labels: the goal's title, capped so one long goal cannot eat the tab
 * row. The full title is everywhere else it matters — the goal list, the
 * tab's own Insights card.
 */
function tabLabel(title: string): string {
  return title.length > 14 ? `${title.slice(0, 13).trimEnd()}…` : title;
}

/** One radar axis: a category, and the execution it is running at. */
type CategoryRow = { category: GoalCategory; pct: number | null };

/**
 * Execution per category across the active goals.
 *
 * Weighted by what was due — completed and expected summed over every goal in
 * the category, the same numerator-over-denominator rule `goalExecution` uses
 * across trackables — so a once-a-month goal does not outvote a daily one.
 * Only the categories the goals actually fall in get an axis, in the enum's
 * fixed order, which is what makes two weeks of overviews comparable.
 */
function categoryRows(
  goals: GoalRow[],
  consistencyByGoal: Map<string, GoalConsistency>,
): CategoryRow[] {
  const buckets = new Map<GoalCategory, { completed: number; expected: number }>();
  for (const goal of goals) {
    const execution = consistencyByGoal.get(goal.id)?.execution;
    if (!execution) continue;
    const bucket = buckets.get(goal.category) ?? { completed: 0, expected: 0 };
    bucket.completed += execution.completed;
    bucket.expected += execution.expected;
    buckets.set(goal.category, bucket);
  }

  return GOAL_CATEGORIES.filter((category) => buckets.has(category)).map((category) => {
    const bucket = buckets.get(category)!;
    return {
      category,
      pct: bucket.expected === 0 ? null : Math.round((bucket.completed / bucket.expected) * 100),
    };
  });
}

/**
 * The shape of execution when there are enough axes to draw one.
 *
 * The reveal grows the polygon out of the centre, and it is gated on the
 * sheet's settled context: the whole body mounts through `Sheet.Deferred`
 * once the rise is over, so the chart is born still and plays then, rather
 * than animating against the sheet's own spring.
 */
function CategoryRadar({ rows, gold }: { rows: CategoryRow[]; gold: string }) {
  const data = React.useMemo(
    () => rows.map((row) => ({ axis: categoryLabel(row.category), execution: row.pct })),
    [rows],
  );

  return (
    <RadarChart
      data={data}
      axisKey="axis"
      domain={[0, 100]}
      size={168}
      accessibilityLabel="Execution by category"
      accessibilityLabelForDatum={(datum) => {
        const pct = typeof datum.execution === 'number' ? `${datum.execution}%` : 'not yet measurable';
        return `${datum.axis}, ${pct}`;
      }}
    >
      <RadarChart.Grid />
      <RadarChart.Axis />
      <RadarChart.Series dataKey="execution" color={gold} showDots />
    </RadarChart>
  );
}

/**
 * The same reading with one or two axes, where a radar does not exist: two
 * spokes make a line, so the categories stand as bars and say it plainly.
 */
function CategoryBars({ rows, dim }: { rows: CategoryRow[]; dim?: string }) {
  return (
    <View className="gap-3">
      {rows.map((row) => (
        <View key={row.category} className="gap-1.5">
          <View className="flex-row items-baseline justify-between gap-3">
            <ThemedText type="bodySm">{categoryLabel(row.category)}</ThemedText>
            <ThemedText type="labelMd" color={dim}>
              {row.pct == null ? '—' : `${row.pct}%`}
            </ThemedText>
          </View>
          <Progress
            value={row.pct ?? 0}
            size="sm"
            color="primary"
            accessibilityLabel={`${categoryLabel(row.category)} execution ${
              row.pct == null ? 'not yet measurable' : `${row.pct}%`
            }`}
          />
        </View>
      ))}
    </View>
  );
}

/**
 * One goal's Insights, as a tab of the overview.
 *
 * The goal is not the one Compass is pointed at, so its trackables and logs
 * are read on demand — the first visit to a tab costs the read, and the panel
 * only mounts once the sheet has settled.
 */
function GoalInsightsPanel({
  goal,
  consistency,
}: {
  goal: GoalRow;
  consistency: GoalConsistency | null;
}) {
  const data = useGoalInsights(goal.id);
  if (!data) return null;
  return (
    <InsightsBody
      goal={goal}
      consistency={consistency}
      trackables={data.trackables}
      logsByTrackable={data.logsByTrackable}
    />
  );
}

/**
 * One compared number: the goal it belongs to on the left, the figure doing
 * the talking on the right. The shape is StatCard's — label small, number at
 * display weight — turned into a row so two of them can sit against each
 * other and the gap between the figures IS the message.
 */
function LeanRow({
  goal,
  subtext,
  pct,
  color,
  dim,
  starred,
}: {
  goal: GoalRow;
  subtext: string;
  pct: number;
  color: string;
  dim?: string;
  starred?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="flex-1 flex-row items-center gap-2.5">
        <GoalDot category={goal.category} />
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <ThemedText type="bodySm" numberOfLines={1}>
              {goal.title}
            </ThemedText>
            {starred && <Star size={10} color={color} fill={color} />}
          </View>
          <ThemedText type="labelSm" color={dim}>
            {subtext}
          </ThemedText>
        </View>
      </View>
      <ThemedText type="headlineMd" color={color}>
        {`${pct}%`}
      </ThemedText>
    </View>
  );
}

/**
 * The lean signal, as Apple presents a comparison: not a sentence but a card,
 * a small labelled row up top, two figures at display weight, and one line of
 * guidance in footnote text. The tones are the app's own pace colours, so the
 * numbers say what the header claims — the side goal genuinely finishing well
 * against a main goal that is not.
 */
function LeanCard({
  leader,
  primary,
  leaderRatio,
  primaryRatio,
}: {
  leader: GoalRow;
  primary: GoalRow;
  leaderRatio: number;
  primaryRatio: number;
}) {
  const [primaryToken, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);
  const gold = asColor(primaryToken) ?? '#f2ca50';
  const dim = asColor(mutedForeground);
  // A consistency ratio is already measured against what was due to date, so
  // the clock does not get a second say here.
  const leaderColor = toneColor(paceTone(leaderRatio, null), gold);
  const primaryColor = toneColor(paceTone(primaryRatio, null), gold);

  return (
    <Card>
      <Card.Content className="gap-3 p-4">
        <View className="flex-row items-center gap-1.5">
          <Target size={12} color={dim} strokeWidth={2} />
          <ThemedText type="labelSm" color={dim}>
            MAIN GOAL TRAILING
          </ThemedText>
        </View>

        <LeanRow
          goal={leader}
          subtext="SIDE GOAL"
          pct={Math.round(leaderRatio * 100)}
          color={leaderColor}
          dim={dim}
        />
        <View className="h-px bg-border" />
        <LeanRow
          goal={primary}
          subtext="MAIN GOAL"
          pct={Math.round(primaryRatio * 100)}
          color={primaryColor}
          dim={dim}
          starred
        />

        <ThemedText type="bodySm" color={dim}>
          The main goal is where the prize is.
        </ThemedText>
      </Card.Content>
    </Card>
  );
}

/**
 * Every active goal at once: the execution shape across their categories, the
 * goals themselves, and the lean card when the main prize is being left
 * behind — plus a tab per goal carrying that goal's full Insights view, so
 * the set and its members read from one place.
 *
 * With a single active goal this sheet never opens — the insights button goes
 * straight to that goal's Insights — so the Overview tab is all about the set.
 */
export function OverviewSheet({
  visible,
  onClose,
  goals,
  primaryGoalId,
  consistencyByGoal,
  onSelectGoal,
  onMakePrimary,
}: OverviewSheetProps) {
  const [primaryToken, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);
  const gold = asColor(primaryToken) ?? '#f2ca50';
  const dim = asColor(mutedForeground);

  // Land on the overview each time the sheet opens; a goal tab is a detour,
  // not a place to live. Reset during render on the visible flip — the
  // sanctioned pattern, not an effect chasing it.
  const [tab, setTab] = React.useState(OVERVIEW_TAB);
  const [wasVisible, setWasVisible] = React.useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (!visible) setTab(OVERVIEW_TAB);
  }

  const rows = React.useMemo(() => categoryRows(goals, consistencyByGoal), [goals, consistencyByGoal]);

  const primary = goals.find((g) => g.id === primaryGoalId) ?? null;
  const lean = React.useMemo(() => {
    if (!primary) return null;
    return leanSignal(
      consistencyByGoal.get(primary.id)?.execution ?? null,
      goals
        .filter((g) => g.id !== primary.id)
        .map((g) => ({ id: g.id, execution: consistencyByGoal.get(g.id)?.execution ?? null })),
    );
  }, [goals, primary, consistencyByGoal]);
  const leanLeader = lean ? (goals.find((g) => g.id === lean.leaderId) ?? null) : null;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      snapRatios={SNAP_RATIOS}
      scrollable
      contentPanning={false}
    >
      {/* Charts and a list of meters: held until the sheet has settled, like
          the insights body, so the mount never competes with the rise. */}
      <Sheet.Deferred skeleton={<OverviewSkeleton />}>
        <Tabs value={tab} onValueChange={setTab} defaultValue={OVERVIEW_TAB} className="flex-1">
          {/* Pinned above the scroll, so switching never means scrolling back
              up first. Scrollable: goal titles are the labels, and five of
              them do not fit a row. The wrapper matters: a horizontal
              ScrollView carries RN's default flexGrow of 1, so bare in the
              flex-1 tab set it would fight the panel for the sheet's height
              and stretch every trigger into a slab. */}
          <View className="flex-none">
            <Tabs.List scrollable className="px-4 pt-2">
              <Tabs.Trigger value={OVERVIEW_TAB}>Overview</Tabs.Trigger>
              {goals.map((goal) => (
                <Tabs.Trigger key={goal.id} value={goal.id}>
                  {tabLabel(goal.title)}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </View>

          <PageFade edges="both" surface="popover">
            <Sheet.ScrollView contentContainerClassName="gap-4 px-4 pb-6">
              <Tabs.Content value={OVERVIEW_TAB} className="gap-4">
                {rows.length > 0 && (
                  <Card>
                    <Card.Content className="gap-3 p-4">
                      <ThemedText type="labelSm" color={dim}>
                        EXECUTION BY CATEGORY
                      </ThemedText>
                      {rows.length >= 3 ? (
                        <View className="items-center py-1">
                          <CategoryRadar rows={rows} gold={gold} />
                        </View>
                      ) : (
                        <CategoryBars rows={rows} dim={dim} />
                      )}
                    </Card.Content>
                  </Card>
                )}

                <View className="gap-2">
                  <ThemedText type="labelSm" color={dim}>
                    GOALS
                  </ThemedText>
                  {goals.map((goal) => (
                    <OverviewGoalRow
                      key={goal.id}
                      goal={goal}
                      isPrimary={goal.id === primaryGoalId}
                      consistency={consistencyByGoal.get(goal.id) ?? null}
                      onSelect={() => onSelectGoal(goal.id)}
                      onMakePrimary={() => onMakePrimary(goal.id)}
                    />
                  ))}
                </View>

                {/* Exactly one card, and only when the primary is actually
                    being beaten — a nudge that shows on an ordinary day is
                    not a nudge. */}
                {lean && leanLeader && primary && (
                  <LeanCard
                    leader={leanLeader}
                    primary={primary}
                    leaderRatio={lean.leaderRatio}
                    primaryRatio={lean.primaryRatio}
                  />
                )}
              </Tabs.Content>

              {goals.map((goal) => (
                <Tabs.Content key={goal.id} value={goal.id} className="gap-4">
                  <GoalInsightsPanel
                    goal={goal}
                    consistency={consistencyByGoal.get(goal.id) ?? null}
                  />
                </Tabs.Content>
              ))}
            </Sheet.ScrollView>
          </PageFade>
        </Tabs>
      </Sheet.Deferred>
    </Sheet>
  );
}
