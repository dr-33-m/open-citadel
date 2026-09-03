/**
 * The goal this Compass surface is about, and the way to change it.
 *
 * A chip that names the active goal — a category dot, the title, a chevron —
 * over a popover that lists the active goals and a way to start a new one.
 * It sits with the deck / planner / insights controls in the control centre
 * because it scopes all of them: switch the goal and every one of those views
 * follows.
 *
 * The switch itself is a popover rather than a sheet: it anchors to the chip
 * and keeps the conversation behind it visible, and there is no sheet
 * animation to sit through before you can pick.
 */
import React from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { Check, ChevronDown, Plus, Star } from '@/components/icons';
import { Popover } from '@/components/ui/popover';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { categoryColorVar } from '@/features/compass/utils/category';
import { cn } from '@/lib/cn';
import type { GoalRow } from '@/stores/compass';
import { asColor } from '@/utils/colors';

type GoalSwitcherProps = {
  /** The active goals, primary first — at most {@link MAX_ACTIVE_GOALS}. */
  goals: GoalRow[];
  activeGoalId: string | null;
  primaryGoalId: string | null;
  onSelect: (goalId: string) => void;
  /** Start a fresh plan conversation. */
  onNewGoal: () => void;
  /** Held while a turn or a switch is in flight. */
  disabled?: boolean;
};

const DOT = 8;

/** The category's colour as a small square — the same square in the overview
 *  list and on a deck card, so a goal reads as one identity across surfaces. */
function GoalDot({ category }: { category: GoalRow['category'] }) {
  const color = useCSSVariable(categoryColorVar(category));
  return (
    <View
      style={{ width: DOT, height: DOT, backgroundColor: asColor(color) }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

export function GoalSwitcher({
  goals,
  activeGoalId,
  primaryGoalId,
  onSelect,
  onNewGoal,
  disabled = false,
}: GoalSwitcherProps) {
  const [open, setOpen] = React.useState(false);
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const [foreground, primaryFg, mutedForeground] = useCSSVariable([
    '--color-foreground',
    '--color-primary-foreground',
    '--color-muted-foreground',
  ]);

  const active = goals.find((g) => g.id === activeGoalId) ?? goals[0] ?? null;
  const activeIsPrimary = active != null && active.id === primaryGoalId;

  React.useEffect(() => {
    progress.value = reducedMotion
      ? open
        ? 1
        : 0
      : withTiming(open ? 1 : 0, { duration: 180 });
  }, [open, reducedMotion, progress]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 180}deg` }],
  }));

  if (!active) return null;

  const chevronColor = asColor(activeIsPrimary ? primaryFg : mutedForeground);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <Touchable
          disabled={disabled}
          haptic="select"
          accessibilityRole="button"
          accessibilityLabel={`Goal: ${active.title}. Change goal.`}
          accessibilityState={{ expanded: open, disabled }}
          className={cn(
            'h-8 flex-row items-center gap-1.5 self-start rounded-full border px-2.5',
            activeIsPrimary ? 'border-primary bg-primary' : 'border-border bg-transparent',
            disabled && 'opacity-[0.56]',
          )}
        >
          {activeIsPrimary ? (
            <Star size={12} color={asColor(primaryFg)} fill={asColor(primaryFg)} />
          ) : (
            <GoalDot category={active.category} />
          )}
          <ThemedText
            type="labelSm"
            numberOfLines={1}
            color={asColor(activeIsPrimary ? primaryFg : foreground)}
            style={{ maxWidth: 168 }}
          >
            {active.title}
          </ThemedText>
          <Animated.View style={chevronStyle}>
            <ChevronDown size={14} color={chevronColor} />
          </Animated.View>
        </Touchable>
      </Popover.Trigger>

      <Popover.Content
        // The chip lives on the floating input card near the bottom of the
        // screen, so the panel wants to open upward — `top` is the preference,
        // and the popover still flips it if the room is the other way.
        placement="top"
        align="start"
        width="content-fit"
        minWidth={232}
        scrollable
        scrim
        className="gap-0 p-0"
      >
        <ThemedText
          type="labelSm"
          color={asColor(mutedForeground)}
          className="px-3 pb-1.5 pt-2.5"
        >
          GOALS
        </ThemedText>

        {goals.map((goal) => (
          <Touchable
            key={goal.id}
            haptic="select"
            accessibilityRole="button"
            accessibilityState={{ selected: goal.id === activeGoalId }}
            className="flex-row items-center gap-2.5 px-3 py-2.5"
            onPress={() => {
              setOpen(false);
              if (goal.id !== activeGoalId) onSelect(goal.id);
            }}
          >
            <GoalDot category={goal.category} />
            <ThemedText type="bodyMd" numberOfLines={1} className="flex-1">
              {goal.title}
            </ThemedText>
            {goal.id === primaryGoalId ? (
              <Star size={13} color={asColor(mutedForeground)} fill={asColor(mutedForeground)} />
            ) : null}
            {goal.id === activeGoalId ? (
              <Check size={16} color={asColor(foreground)} />
            ) : null}
          </Touchable>
        ))}

        <View className="mx-3 my-1 h-px bg-border" />

        <Touchable
          haptic="select"
          accessibilityRole="button"
          className="flex-row items-center gap-2.5 px-3 pb-2.5 pt-2"
          onPress={() => {
            setOpen(false);
            onNewGoal();
          }}
        >
          <Plus size={16} color={asColor(mutedForeground)} />
          <ThemedText type="bodyMd" color={asColor(mutedForeground)}>
            New goal
          </ThemedText>
        </Touchable>
      </Popover.Content>
    </Popover>
  );
}
