import React from 'react';
import { View } from 'react-native';
import { ChevronLeft } from '@/components/icons';
import { Pressable } from 'react-native-gesture-handler';
import { useCSSVariable } from 'uniwind';

import { GOAL_CATEGORIES, type GoalCategory } from 'samwell-shared';

import { ThemedText } from '@/components/themed-text';
import { PageFade } from '@/components/scroll-fades';
import { Card } from '@/components/ui/card';
import { RadarChart } from '@/components/ui/radar-chart';
import { Sheet } from '@/components/ui/sheet';
import { OverviewSkeleton } from '@/components/skeletons/compass-skeletons';
import { GoalAbandonDialog } from '@/features/compass/components/goal-abandon-dialog';
import { GoalAwardDialog } from '@/features/compass/components/goal-award-dialog';
import { GoalDetailPanel } from '@/features/compass/components/goal-detail-panel';
import { OverviewGoalRow } from '@/features/compass/components/overview-goal-row';
import { OverviewMainGoal } from '@/features/compass/components/overview-main-goal';
import { categoryLabel } from '@/features/compass/utils/category';
import { useBackHandler } from '@/hooks/use-back-handler';
import { useToday } from '@/hooks/use-today';
import { leanSignal } from '@/services/consistency';
import type { GoalConsistency, GoalRow } from '@/stores/compass';
import { asColor } from '@/utils/colors';
import { haptics } from '@/utils/haptics';

type OverviewSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** The active goals, primary first — at most five. */
  goals: GoalRow[];
  primaryGoalId: string | null;
  consistencyByGoal: Map<string, GoalConsistency>;
  /** Move the primary mark. */
  onMakePrimary: (goalId: string) => void;
  /** Close a goal out, or retire it early with the reader's reason. */
  onFinishGoal: (goalId: string) => Promise<void>;
  onAbandonGoal: (goalId: string, reason: string | null) => Promise<void>;
};

const SNAP_RATIOS = [0.62, 0.95];

/**
 * Axes below which a radar is not a shape.
 *
 * Two spokes are a line and three is the first real polygon. Below that the
 * card was drawn as a row of bars, and that is exactly what this screen no
 * longer does: with one goal per category those bars were the goal list again
 * with the goals' names replaced by their categories', which is the same
 * reading twice and the less specific one first. The radar earns its place at
 * three because a shape says something a list cannot — whether the effort is
 * spread or lopsided — so it is drawn then and not otherwise.
 */
const MIN_RADAR_AXES = 3;

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
 * The shape of execution across the categories the goals fall in.
 *
 * Gated on the sheet's settled context: the whole body mounts through
 * `Sheet.Deferred` once the rise is over, so the chart is born still and plays
 * then, rather than animating against the sheet's own spring.
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
      accessibilityLabel="Consistency by category"
      accessibilityLabelForDatum={(datum) => {
        const pct =
          typeof datum.execution === 'number' ? `${datum.execution}%` : 'not yet measurable';
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
 * Every active goal at once, and a way into each one.
 *
 * ## Why this is a drill-down and not tabs
 *
 * It was a tab bar: Overview, then one tab per goal. Goal titles are sentences
 * the reader wrote — "100 TikTok videos by December 1" — so every tab was
 * elided to fourteen characters, and both of the reader's goals began with
 * words that survived the cut while the part telling them apart did not. No
 * amount of styling fixes that, and five goals makes it worse. "Overview" was
 * also sitting as a peer of the goals while being a different kind of thing
 * entirely: a summary of the set, not a member of it.
 *
 * A list that opens into a detail says the same structure without labels it
 * cannot fit — the set first, one goal one level deeper — and it gives the row
 * a single meaning. Before, the row repointed all of Compass at a goal and
 * closed the sheet while the tab merely showed that goal's numbers, so the two
 * ways into a goal did two unrelated things and neither said which.
 *
 * ## Why the overview is three things and not five
 *
 * Every card here answers a different question, which is the rule the
 * single-goal Insights view follows and the reason it reads well. The main
 * goal is the hero because Compass's whole claim is that one goal is where the
 * prize is; the radar under it is the shape of the whole set; and the side
 * goals are a lighter list below, most specific and so last. The lean signal
 * moved inside the hero, since it is a statement about the main goal. What went is the duplication: with
 * two goals the old screen stated the same two percentages three times over,
 * in three cards, the least specific one first.
 */
export function OverviewSheet({
  visible,
  onClose,
  goals,
  primaryGoalId,
  consistencyByGoal,
  onMakePrimary,
  onFinishGoal,
  onAbandonGoal,
}: OverviewSheetProps) {
  const [primaryToken, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);
  const gold = asColor(primaryToken) ?? '#f2ca50';
  const dim = asColor(mutedForeground);

  // Land on the overview each time the sheet opens; a goal is a detour, not a
  // place to live. Reset during render on the visible flip — the sanctioned
  // pattern, not an effect chasing it.
  const [openGoalId, setOpenGoalId] = React.useState<string | null>(null);
  const [wasVisible, setWasVisible] = React.useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (!visible) setOpenGoalId(null);
  }

  const rows = React.useMemo(
    () => categoryRows(goals, consistencyByGoal),
    [goals, consistencyByGoal],
  );

  const primary = goals.find((g) => g.id === primaryGoalId) ?? null;
  const others = goals.filter((g) => g.id !== primary?.id);

  /**
   * What is beating the main goal, worded for the band on its card.
   *
   * `leanSignal` names the single best side goal that is strictly ahead, and
   * returns nothing when the main goal is level or in front — so most days
   * there is no band at all, which is what keeps it a nudge rather than
   * furniture. When more than one is ahead, naming only the leader would be
   * true and misleading in the same breath, so the count speaks instead: the
   * point stops being which goal and starts being how many.
   */
  const outpacedBy = React.useMemo(() => {
    if (!primary) return null;
    const primaryExecution = consistencyByGoal.get(primary.id)?.execution ?? null;
    const others = goals
      .filter((g) => g.id !== primary.id)
      .map((g) => ({ id: g.id, execution: consistencyByGoal.get(g.id)?.execution ?? null }));

    const lean = leanSignal(primaryExecution, others);
    if (!lean) return null;

    const ahead = others.filter(
      (other) =>
        other.execution?.ratio != null &&
        lean.primaryRatio != null &&
        other.execution.ratio > lean.primaryRatio,
    ).length;
    if (ahead > 1) return `${ahead} side goals are running`;

    const leader = goals.find((g) => g.id === lean.leaderId);
    return leader ? `${leader.title} is running` : null;
  }, [goals, primary, consistencyByGoal]);

  const openGoal = openGoalId ? (goals.find((g) => g.id === openGoalId) ?? null) : null;
  const closeGoal = React.useCallback(() => setOpenGoalId(null), []);

  /*
   * Ending a goal, in two acts.
   *
   * `awarded` holds the title of the goal just finished rather than a boolean,
   * because by the time the dialog is on screen the goal is no longer in
   * `goals` — it has left the active set — and a dialog that congratulated you
   * on nothing would be the result of reading it back out of a list it is no
   * longer in.
   *
   * The reason itself is not here at all: `GoalAbandonDialog` owns its own
   * field and hands the text up on confirm. This sheet used to keep a mirror
   * of it, reset it by hand, and read it back — three places holding one
   * string.
   */
  const [awarded, setAwarded] = React.useState<string | null>(null);
  const [abandoning, setAbandoning] = React.useState<GoalRow | null>(null);

  // Plain handlers, not `useCallback`: nothing below is memoized on their
  // identity, and wrapping a function that reads a ref only gives the compiler
  // a memo it cannot preserve.
  const finishGoal = () => {
    if (!openGoal) return;
    const title = openGoal.title;
    setOpenGoalId(null);
    void onFinishGoal(openGoal.id).then(() => setAwarded(title));
  };

  const startAbandon = () => {
    if (!openGoal) return;
    setAbandoning(openGoal);
  };

  const confirmAbandon = (reason: string) => {
    const goal = abandoning;
    if (!goal) return;
    setAbandoning(null);
    setOpenGoalId(null);
    void onAbandonGoal(goal.id, reason || null);
  };

  // One clock for the whole sheet, handed down. See `useToday`: a day count
  // read during render is frozen at whatever day that render happened on.
  const today = useToday();

  /*
   * Hardware back leaves the goal before it leaves the sheet.
   *
   * `Sheet` registers its own handler to dismiss, and a subscription added
   * later is called first — this one is added when a goal opens, so it wins
   * for exactly as long as there is a goal to close. Without it, back from a
   * goal threw away the sheet as well, which is the same accidental exit the
   * back control's small tap target was causing.
   */
  useBackHandler(openGoal !== null, closeGoal);

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
        {/* Pinned above the scroll, so the way back is never something you
            have to scroll up to find. No transition between the two levels:
            the goal's view mounts rings and a heatmap, and the house rule is
            not to mount expensive content while anything is still moving. */}
        {openGoal && (
          /*
           * A Gesture Handler `Pressable`, not the app's `Touchable`, and the
           * whole 44pt row rather than the words.
           *
           * This row is the sheet's only chrome OUTSIDE `Sheet.ScrollView`,
           * and that turns out to matter a great deal. The backdrop's
           * press-to-close is a Gesture Handler tap over the WHOLE screen,
           * including the part the sheet covers. Gesture Handler does not
           * take part in React Native's responder system, so an ordinary
           * Pressable cannot claim a touch away from it: both fired for the
           * same press, and tapping this control went back AND dismissed the
           * sheet underneath. Missing it dismissed without going back. Inside
           * the scroll view none of this happens, because a scrollable
           * registers a native handler that wins the arbitration — which is
           * why the gutter beside a card is harmless and this row was not.
           *
           * So the control has to be a gesture too, and then it wins the same
           * way. Its own press dim stands in for `Touchable`'s, since that is
           * the piece being given up. Anything else ever pinned above the
           * scroll in a sheet needs the same treatment.
           */
          <View className="flex-none px-4 pb-1 pt-2">
            <Pressable
              onPress={() => {
                haptics.select();
                closeGoal();
              }}
              hitSlop={{ top: 4, bottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Back to all goals"
              style={({ pressed }) => ({
                height: 44,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <ChevronLeft size={18} color={gold} strokeWidth={2} />
              <ThemedText type="labelSm" color={gold}>
                ALL GOALS
              </ThemedText>
            </Pressable>
          </View>
        )}

        <PageFade edges="both" surface="popover">
          <Sheet.ScrollView contentContainerClassName="gap-4 px-4 pb-6 pt-2">
            {openGoal ? (
              <GoalDetailPanel
                goal={openGoal}
                consistency={consistencyByGoal.get(openGoal.id) ?? null}
                isPrimary={openGoal.id === primaryGoalId}
                onMakePrimary={() => onMakePrimary(openGoal.id)}
                onFinish={finishGoal}
                onAbandon={startAbandon}
              />
            ) : (
              <>
                {primary && (
                  <OverviewMainGoal
                    goal={primary}
                    consistency={consistencyByGoal.get(primary.id) ?? null}
                    today={today}
                    outpacedBy={outpacedBy}
                    onOpen={() => setOpenGoalId(primary.id)}
                  />
                )}

                {/* Straight after the hero, and before the goals it is made
                    of. The screen then reads main goal, then the shape of the
                    whole set, then the members: summary before detail, with
                    the longest and most specific thing last. It answers a
                    question the list below cannot — whether the effort is
                    spread or lopsided — which is why it is worth a card, and
                    why it is not worth one when there are too few axes to
                    have a shape. */}
                {rows.length >= MIN_RADAR_AXES && (
                  <Card>
                    <Card.Content className="gap-3 p-4">
                      <ThemedText type="labelSm" color={dim}>
                        CONSISTENCY BY CATEGORY
                      </ThemedText>
                      <View className="items-center py-1">
                        <CategoryRadar rows={rows} gold={gold} />
                      </View>
                      {/* The scale, stated. A radar with no ring labelled is
                          a shape with no size: the reader can see which spoke
                          is longest and has no way to know whether the
                          longest one is good. Under the chart and on the
                          trailing edge, where the heatmap keeps its own key,
                          because a key belongs after the thing it explains.

                          The numbers themselves stay off the spokes. Every
                          category here is one goal's category most of the
                          time, so printing them would be the list above read
                          out a second time; what this card is for is the
                          shape, which the list cannot show. */}
                      <View className="flex-row items-center justify-end">
                        <ThemedText type="labelSm" color={dim}>
                          OUTER RING IS 100%
                        </ThemedText>
                      </View>
                    </Card.Content>
                  </Card>
                )}
                {others.length > 0 && (
                  <View className="gap-2">
                    <ThemedText type="labelSm" color={dim}>
                      SIDE GOALS
                    </ThemedText>
                    {others.map((goal) => (
                      <OverviewGoalRow
                        key={goal.id}
                        goal={goal}
                        consistency={consistencyByGoal.get(goal.id) ?? null}
                        today={today}
                        onOpen={() => setOpenGoalId(goal.id)}
                      />
                    ))}
                  </View>
                )}

              </>
            )}
          </Sheet.ScrollView>
        </PageFade>
      </Sheet.Deferred>

      {/* Siblings of the sheet's body, drawn through a portal above it: a
          second modal would dismiss the sheet underneath, and these are
          questions asked ON BEHALF of what is still open behind them. */}
      <GoalAwardDialog title={awarded} onClose={() => setAwarded(null)} />
      {/* Keyed by the goal: a different goal is a different instance, so the
          reason field starts empty without anyone clearing it. */}
      <GoalAbandonDialog
        key={abandoning?.id ?? 'none'}
        title={abandoning?.title ?? null}
        onConfirm={confirmAbandon}
        onCancel={() => setAbandoning(null)}
      />
    </Sheet>
  );
}
