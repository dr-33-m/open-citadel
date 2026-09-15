import { View } from 'react-native';
import { CalendarClock, ChevronRight, Shapes, Target } from '@/components/icons';
import type { LucideIcon } from '@/components/icons';
import { useCSSVariable } from 'uniwind';

import { consistencyScore, consistencyTone, toneColor } from '@/components/compass/format';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { elevation } from '@/constants/theme';
import { GoalDot } from '@/features/compass/components/goal-dot';
import { categoryLabel } from '@/features/compass/utils/category';
import type { GoalConsistency, GoalRow } from '@/stores/compass';
import { asColor } from '@/utils/colors';
import { daysBetween, type Ymd } from '@/utils/day';

type OverviewGoalRowProps = {
  goal: GoalRow;
  consistency: GoalConsistency | null;
  /** Handed down rather than read here: the sheet holds one clock for the
   *  whole list, so five rows do not each keep a midnight timer alive. */
  today: Ymd;
  /** Open this goal's own Insights, inside the same sheet. */
  onOpen: () => void;
};

/**
 * One fact about the goal: an icon over a value, centred in its own column.
 *
 * The icon is what lets the value below it be short. `LEARNING` under a shapes
 * glyph needs the word "category" nowhere, and three of these read as three
 * facts rather than as one sentence held together by separators — which is
 * what the row was before, and why `16 OF 22 SO FAR` had to explain itself.
 */
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
 * A side goal in the overview.
 *
 * Deliberately lighter than the main goal above it: a title, and three facts
 * under a rule. The percentage moved out of the title row into a column of its
 * own, where the target glyph names it — the same glyph the CONSISTENCY figure
 * carries on the goal's own page and in the hero, so one mark means one number
 * everywhere in Compass.
 *
 * There is no meter on this card, and that is deliberate. Every bar in Compass
 * is the goal's clock; this one was consistency, sitting directly above a
 * caption that said how many days were left, so a reader mapped the bar to the
 * days and read a perfectly kept goal as nearly over. One picture cannot mean
 * two things.
 */
export function OverviewGoalRow({ goal, consistency, today, onOpen }: OverviewGoalRowProps) {
  const [primary, mutedForeground, bone] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
    '--color-chart-3',
  ]);
  const muted = asColor(mutedForeground);
  const neutral = asColor(bone) ?? asColor(primary) ?? '#f2ca50';

  const execution = consistency?.execution ?? null;
  const executionPct = consistencyScore(execution);
  const daysLeft = Math.max(0, daysBetween(today, goal.endDate));

  return (
    <Touchable
      // A card, with the weight every other card in the app has.
      className="border border-border bg-card p-3"
      style={elevation.soft}
      onPress={onOpen}
      haptic="select"
      accessibilityRole="button"
      accessibilityLabel={`${goal.title}, ${categoryLabel(goal.category)}, consistency ${
        executionPct == null ? 'not yet measurable' : `${executionPct}% so far`
      }, ${daysLeft} days left. Opens this goal.`}
    >
      <View className="gap-3">
        <View className="flex-row items-center gap-2">
          <GoalDot category={goal.category} />
          <ThemedText type="bodyMd" numberOfLines={1} className="flex-1">
            {goal.title}
          </ThemedText>
          <ChevronRight size={15} color={muted} strokeWidth={2} />
        </View>

        {/* Hairlines between the columns, matching the pair of figures on the
            main goal's card. The rule above them separates the facts from the
            name, so the title keeps the top of the card to itself. */}
        <View className="flex-row border-t border-border pt-3">
          <Facet
            icon={Shapes}
            value={categoryLabel(goal.category).toUpperCase()}
            muted={muted}
          />
          <View className="w-px bg-border" />
          <Facet
            icon={CalendarClock}
            value={`${daysLeft} ${daysLeft === 1 ? 'DAY' : 'DAYS'} LEFT`}
            muted={muted}
          />
          <View className="w-px bg-border" />
          <Facet
            icon={Target}
            value={executionPct == null ? '—' : `${executionPct}% SO FAR`}
            color={toneColor(consistencyTone(execution), neutral)}
            muted={muted}
          />
        </View>
      </View>
    </Touchable>
  );
}
