import { View } from 'react-native';
import { Award, CalendarCheck2, CalendarX2, ChevronRight, CircleMinus, Shapes, Target } from '@/components/icons';
import type { LucideIcon } from '@/components/icons';
import { useCSSVariable } from 'uniwind';

import { formatCompassDate } from '@/components/compass/format';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { elevation } from '@/constants/theme';
import { GoalDot } from '@/features/compass/components/goal-dot';
import { categoryLabel } from '@/features/compass/utils/category';
import type { PastGoal } from '@/stores/compass';
import { asColor } from '@/utils/colors';

type PastGoalRowProps = {
  entry: PastGoal;
  onOpen: () => void;
};

/** One fact, an icon over its value. The same strip the side goals carry. */
function Facet({
  icon: Icon,
  value,
  color,
  muted,
}: {
  icon: LucideIcon;
  value: string;
  color?: string;
  muted?: string;
}) {
  return (
    <View className="flex-1 items-center gap-1.5">
      <Icon size={13} color={muted} strokeWidth={2} />
      <ThemedText type="labelSm" color={color ?? muted} numberOfLines={1}>
        {value}
      </ThemedText>
    </View>
  );
}

/**
 * One goal in the archive.
 *
 * Deliberately the same card as a side goal in the overview, down to the
 * three-column strip, because it is the same kind of object seen later. What
 * changes is the tense: the days-left column becomes the day it ended, and the
 * consistency figure drops its "so far" — this one is not still being earned.
 *
 * The gold mark is the whole point of the row. Finished and stopped are the
 * two things a reader comes to this list to tell apart, and they are told
 * apart at a glance rather than by reading the numbers.
 */
export function PastGoalRow({ entry, onOpen }: PastGoalRowProps) {
  const { goal, outcome } = entry;
  const [primary, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);
  const gold = asColor(primary) ?? '#f2ca50';
  const muted = asColor(mutedForeground);

  const finished = outcome.completed === 1;
  // The badge on the title row: an award that was earned, or the quiet minus
  // of one that was stopped. This is the same mark the finish dialog gives.
  const Mark = finished ? Award : CircleMinus;
  // The date facet says WHICH KIND of ending that day was — a calendar seen
  // through, or one cut short. The clock face it replaces was counting down
  // to something, which is the one thing an ended goal is no longer doing.
  const EndMark = finished ? CalendarCheck2 : CalendarX2;
  const pct =
    outcome.executionRatio == null ? null : Math.round(outcome.executionRatio * 100);

  return (
    <Touchable
      // A card, with the weight every other card in the app has. Flat on the
      // sheet it read as a table row rather than something you open.
      className="border border-border bg-card p-3"
      style={elevation.soft}
      onPress={onOpen}
      haptic="select"
      accessibilityRole="button"
      accessibilityLabel={`${goal.title}, ${
        finished ? 'finished' : 'stopped early'
      } on ${formatCompassDate(outcome.endedOn)}, consistency ${
        pct == null ? 'not measured' : `${pct}%`
      }. Opens the summary.`}
    >
      <View className="gap-3">
        <View className="flex-row items-center gap-2">
          <GoalDot category={goal.category} />
          <ThemedText type="bodyMd" numberOfLines={1} className="flex-1">
            {goal.title}
          </ThemedText>
          <Mark size={15} color={finished ? gold : muted} strokeWidth={2} />
          <ChevronRight size={15} color={muted} strokeWidth={2} />
        </View>

        <View className="flex-row border-t border-border pt-3">
          <Facet
            icon={Shapes}
            value={categoryLabel(goal.category).toUpperCase()}
            muted={muted}
          />
          <View className="w-px bg-border" />
          <Facet
            icon={EndMark}
            value={formatCompassDate(outcome.endedOn).toUpperCase()}
            muted={muted}
          />
          <View className="w-px bg-border" />
          {/* No tone on this one. Green and red are for a goal you can still
              do something about; a finished goal's number is a record, and
              colouring it after the fact is the app grading a run that is
              already over. */}
          <Facet icon={Target} value={pct == null ? '—' : `${pct}%`} muted={muted} />
        </View>
      </View>
    </Touchable>
  );
}
