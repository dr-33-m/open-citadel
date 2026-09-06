import React from 'react';
import { View } from 'react-native';
import { ChevronLeft } from '@/components/icons';
import { Pressable } from 'react-native-gesture-handler';
import { useCSSVariable } from 'uniwind';

import { PageFade } from '@/components/scroll-fades';
import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { PastGoalsSkeleton } from '@/components/skeletons/compass-skeletons';
import { PastGoalRow } from '@/features/compass/components/past-goal-row';
import { PastGoalSummary } from '@/features/compass/components/past-goal-summary';
import { useBackHandler } from '@/hooks/use-back-handler';
import type { PastGoal } from '@/stores/compass';
import { asColor } from '@/utils/colors';
import { haptics } from '@/utils/haptics';

type PastGoalsSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Ended goals, most recently ended first. */
  entries: PastGoal[];
  /** Goal ids Samwell is still writing a takeaway for. */
  writingTakeaway: ReadonlySet<string>;
  /** Ask again for a takeaway that never arrived. */
  onRetryTakeaway: (goalId: string) => void;
};

const SNAP_RATIOS = [0.62, 0.95];

/**
 * Everything that has ended, and what came of it.
 *
 * The same drill-down as the overview — a list, and one goal a level deeper —
 * on purpose. These are the same objects the overview holds, seen after the
 * fact, and a reader who has learned that a goal card opens into a goal page
 * should not have to learn it twice.
 *
 * There is no way to reopen a goal from here, and that is deliberate. A goal
 * you stopped and then un-stopped would need its consistency to start counting
 * the gap, or to pretend the gap did not happen, and neither is honest. Ending
 * a goal is a real decision; starting again is a new goal, which Samwell is
 * better placed to shape than a button here.
 */
export function PastGoalsSheet({
  visible,
  onClose,
  entries,
  writingTakeaway,
  onRetryTakeaway,
}: PastGoalsSheetProps) {
  const [primaryToken, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);
  const gold = asColor(primaryToken) ?? '#f2ca50';
  const dim = asColor(mutedForeground);

  // Land on the list each time the sheet opens. Reset during render on the
  // visible flip, the sanctioned pattern rather than an effect chasing it.
  const [openGoalId, setOpenGoalId] = React.useState<string | null>(null);
  const [wasVisible, setWasVisible] = React.useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (!visible) setOpenGoalId(null);
  }

  const open = openGoalId ? (entries.find((e) => e.goal.id === openGoalId) ?? null) : null;
  const closeGoal = React.useCallback(() => setOpenGoalId(null), []);

  // Hardware back leaves the goal before it leaves the sheet. `Sheet`
  // registers its own dismiss handler, and a subscription added later is
  // called first — this one is added when a goal opens, so it wins for exactly
  // as long as there is a goal to close.
  useBackHandler(open !== null, closeGoal);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      snapRatios={SNAP_RATIOS}
      scrollable
      contentPanning={false}
    >
      <Sheet.Deferred skeleton={<PastGoalsSkeleton />}>
        {open && (
          /*
           * A Gesture Handler `Pressable`, not the app's `Touchable`, and the
           * whole 44pt row rather than the words — the same treatment the
           * overview's back control needs, for the same reason. This row is
           * the sheet's only chrome outside `Sheet.ScrollView`, and the
           * backdrop's press-to-close is a gesture over the whole screen.
           * Gesture Handler does not take part in React Native's responder
           * system, so an ordinary Pressable cannot claim the touch away from
           * it: both fire, and the sheet dismisses underneath you.
           */
          <View className="flex-none px-4 pb-1 pt-2">
            <Pressable
              onPress={() => {
                haptics.select();
                closeGoal();
              }}
              hitSlop={{ top: 4, bottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Back to past goals"
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
                PAST GOALS
              </ThemedText>
            </Pressable>
          </View>
        )}

        <PageFade edges="both" surface="popover">
          <Sheet.ScrollView contentContainerClassName="gap-4 px-4 pb-6 pt-2">
            {open ? (
              <PastGoalSummary
                entry={open}
                writingTakeaway={writingTakeaway.has(open.goal.id)}
                onRetryTakeaway={() => onRetryTakeaway(open.goal.id)}
              />
            ) : (
              <>
                {/* One line above the list, and it is doing real work: without
                    it a stopped goal sitting next to a finished one reads as
                    failure filed beside success. Both are here because both
                    are worth keeping. */}
                <ThemedText type="bodySm" color={dim}>
                  Every goal you have closed out, finished or stopped. Samwell keeps all of
                  them.
                </ThemedText>

                {entries.map((entry) => (
                  <PastGoalRow
                    key={entry.goal.id}
                    entry={entry}
                    onOpen={() => setOpenGoalId(entry.goal.id)}
                  />
                ))}
              </>
            )}
          </Sheet.ScrollView>
        </PageFade>
      </Sheet.Deferred>
    </Sheet>
  );
}
