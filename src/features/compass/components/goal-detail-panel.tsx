import React from 'react';
import { View } from 'react-native';
import { Award, Lock, Star } from '@/components/icons';
import { useCSSVariable } from 'uniwind';

import { formatCompassDate } from '@/components/compass/format';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { InsightsBody } from '@/features/compass/components/insights-body';
import { useGoalInsights } from '@/features/compass/hooks/use-goal-insights';
import { useToday } from '@/hooks/use-today';
import type { GoalConsistency, GoalRow } from '@/stores/compass';
import { asColor } from '@/utils/colors';

type GoalDetailPanelProps = {
  goal: GoalRow;
  consistency: GoalConsistency | null;
  isPrimary: boolean;
  /** Move the primary mark here. Left out when there is no other goal to move
   *  it from, which is the single-goal Insights sheet. */
  onMakePrimary?: () => void;
  /** Close the goal out. The button above it is locked until it can be. */
  onFinish: () => void;
  /** Retire it early. Always available: stopping is not something to earn. */
  onAbandon: () => void;
};

/**
 * One goal, opened from the overview or from its own Insights sheet.
 *
 * The body is `InsightsBody` unchanged — the single-goal view, which is
 * already right and which this is deliberately not a variation of. What this
 * adds is everything you can only decide about a goal as a whole: which one
 * carries the prize, and how this one ends.
 */
export function GoalDetailPanel({
  goal,
  consistency,
  isPrimary,
  onMakePrimary,
  onFinish,
  onAbandon,
}: GoalDetailPanelProps) {
  const [primary, mutedForeground, destructive] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
    '--color-destructive',
  ]);
  const gold = asColor(primary);
  const dim = asColor(mutedForeground);
  const today = useToday();
  const data = useGoalInsights(goal.id);

  /**
   * Whether this goal can be closed out yet.
   *
   * The end date, OR the number being reached, whichever comes first. Both
   * halves matter. Without the date, a habit could be declared finished on its
   * third good day, which is the procrastination this app is built against
   * pointed the other way — the reward for setting a goal would be permission
   * to stop. Without the target, a goal genuinely achieved early sits there
   * unfinishable for months, which teaches the opposite lesson: that hitting
   * the number does not count.
   */
  const outcome = consistency?.outcome ?? null;
  const reachedTarget = outcome != null && outcome.target > 0 && outcome.value >= outcome.target;
  const runEnded = today >= goal.endDate;
  const canFinish = runEnded || reachedTarget;

  if (!data) return null;

  return (
    <>
      <InsightsBody
        goal={goal}
        consistency={consistency}
        trackables={data.trackables}
        logsByTrackable={data.logsByTrackable}
      />

      {/* Under the record, not over it. Every decision here is one you can
          only make having read how the goal actually went. */}
      <View className="gap-2 border-t border-border pt-4">
        {/* The whole primary block is gated on `onMakePrimary`, not just the
            button. With one goal there is no primary to be — it is the only
            thing Compass is pointed at — and a badge saying so would be the
            app congratulating a set of one. */}
        {onMakePrimary ? (
          isPrimary ? (
            <View className="flex-row items-center gap-1.5">
              <Star size={11} color={gold} fill={gold} />
              <ThemedText type="labelSm" color={gold}>
                THIS IS YOUR MAIN GOAL
              </ThemedText>
            </View>
          ) : (
            <Touchable
              className="items-center border border-border py-3"
              onPress={onMakePrimary}
              haptic="commit"
              accessibilityRole="button"
              accessibilityLabel={`Make ${goal.title} the main goal`}
            >
              <ThemedText type="labelSm" color={dim}>
                MAKE THIS THE MAIN GOAL
              </ThemedText>
            </Touchable>
          )
        ) : null}

        {/* Locked rather than hidden. A control that is not there teaches
            nothing; one that is there and will not press says there is an end
            to this and you have not reached it, and the line underneath says
            when you will.

            Genuinely `disabled`, not merely dimmed with no handler. Before, it
            still took the press and answered with the ripple and the haptic of
            a button that had worked, then did nothing — which reads as broken
            rather than as locked. And the mark changes: a padlock says WHY it
            will not press, where a dimmed award only says it is unavailable. */}
        <Touchable
          className={
            canFinish
              ? 'flex-row items-center justify-center gap-2 border border-primary py-3'
              : 'flex-row items-center justify-center gap-2 border border-border py-3 opacity-40'
          }
          disabled={!canFinish}
          onPress={canFinish ? onFinish : undefined}
          haptic="commit"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canFinish }}
          accessibilityLabel={
            canFinish
              ? `Finish ${goal.title}`
              : `Finish ${goal.title}. Not yet: this goal runs to ${formatCompassDate(goal.endDate)}.`
          }
        >
          {canFinish ? (
            <Award size={14} color={gold} strokeWidth={2} />
          ) : (
            <Lock size={14} color={dim} strokeWidth={2} />
          )}
          <ThemedText type="labelSm" color={canFinish ? gold : dim}>
            FINISH GOAL
          </ThemedText>
        </Touchable>

        {!canFinish && (
          <ThemedText type="bodySm" color={dim}>
            {`This one runs to ${formatCompassDate(goal.endDate)}. It unlocks then, or as soon as you reach the number.`}
          </ThemedText>
        )}

        {/* Quiet, and never locked. Stopping is not a failure state the app
            gets to gate, and a goal that cannot be stopped is one that gets
            abandoned silently instead, which costs the journal the reason. */}
        <Touchable
          className="items-center py-3"
          onPress={onAbandon}
          haptic="warn"
          accessibilityRole="button"
          accessibilityLabel={`Stop ${goal.title} before the end`}
        >
          <ThemedText type="labelSm" color={asColor(destructive)}>
            STOP THIS GOAL
          </ThemedText>
        </Touchable>
      </View>
    </>
  );
}
