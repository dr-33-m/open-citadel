import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Star } from '@/components/icons';
import { compact, ratioScore } from '@/components/compass/format';
import { Progress } from '@/components/ui/progress';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { GoalDot } from '@/features/compass/components/goal-dot';
import type { GoalConsistency, GoalRow } from '@/stores/compass';
import { asColor } from '@/utils/colors';

type OverviewGoalRowProps = {
  goal: GoalRow;
  isPrimary: boolean;
  consistency: GoalConsistency | null;
  /** Open this goal: the deck, the planner and the conversation follow it. */
  onSelect: () => void;
  /** Move the primary mark here. The primary row has no such action. */
  onMakePrimary: () => void;
};

/**
 * One active goal in the overview.
 *
 * Execution is the meter because it is the number that answers "am I showing
 * up"; the outcome sits under it as a line because it is a different fact, and
 * stacking two bars invites the reading that one explains the other.
 *
 * The row opens the goal; "MAKE MAIN" moves the primary mark without closing
 * the sheet, so the star visibly travels. Both are pressable at once — the
 * chip is the deeper responder and wins the touch, which is what the two
 * different sizes of tap target want anyway.
 */
export function OverviewGoalRow({
  goal,
  isPrimary,
  consistency,
  onSelect,
  onMakePrimary,
}: OverviewGoalRowProps) {
  const [primary, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);
  const muted = asColor(mutedForeground);

  const execution = consistency?.execution ?? null;
  const outcome = consistency?.outcome ?? null;
  const executionPct = ratioScore(execution?.ratio ?? null);
  const outcomePct =
    outcome && outcome.target > 0 ? Math.round((outcome.value / outcome.target) * 100) : null;

  return (
    <Touchable
      className="border border-border bg-card p-3"
      onPress={onSelect}
      haptic="select"
      accessibilityRole="button"
      accessibilityLabel={
        `${goal.title}, execution ${executionPct == null ? 'not yet measurable' : `${executionPct}%`}` +
        (isPrimary ? '. Main goal.' : '')
      }
    >
      <View className="gap-2">
        <View className="flex-row items-center gap-2">
          <GoalDot category={goal.category} />
          <ThemedText type="bodyMd" numberOfLines={1} className="flex-1">
            {goal.title}
          </ThemedText>
          {isPrimary ? (
            <Star size={13} color={asColor(primary)} fill={asColor(primary)} />
          ) : (
            <Touchable
              className="border border-border px-2 py-1"
              onPress={onMakePrimary}
              haptic="commit"
              accessibilityRole="button"
              accessibilityLabel={`Make ${goal.title} the main goal`}
            >
              <ThemedText type="labelSm" color={muted}>
                MAKE MAIN
              </ThemedText>
            </Touchable>
          )}
        </View>

        <View className="flex-row items-center gap-2">
          <Progress
            value={executionPct ?? 0}
            size="sm"
            color="primary"
            className="flex-1"
            accessibilityLabel={
              executionPct == null
                ? 'Execution, not yet measurable'
                : `Execution ${executionPct}%`
            }
          />
          <ThemedText type="labelMd" color={muted}>
            {executionPct == null ? '—' : `${executionPct}%`}
          </ThemedText>
        </View>

        <ThemedText type="labelSm" color={muted}>
          {outcome
            ? `${compact(outcome.value)} of ${compact(outcome.target)} ${outcome.unit}` +
              (outcomePct == null ? '' : ` · ${outcomePct}%`)
            : 'No numeric outcome'}
        </ThemedText>
      </View>
    </Touchable>
  );
}
