import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { Portal } from '@/components/ui/portal';
import { motion } from '@/constants/theme';
import {
  DayGalleryCarousel,
  ITEM_WIDTH,
} from '@/features/compass/components/day-gallery-carousel';
import { PlannerDayCard } from '@/features/compass/components/planner-day-card';
import type { PlannerCell } from '@/features/compass/utils/planner-entries';
import { asColor } from '@/utils/colors';
import type { Ymd } from '@/utils/day';

type PlannerDayDialogProps = {
  /** The open day, or null. */
  date: Ymd | null;
  /** Every day of the month, in order — the run the card swipes through. */
  days: Ymd[];
  cellsByDay: Map<Ymd, PlannerCell[]>;
  today: Ymd;
  onSelect: (date: Ymd) => void;
  onClose: () => void;
};

/**
 * Every card is this tall, whatever is on the day.
 *
 * Sized to the busiest realistic day — a goal carries at most five trackables —
 * because a card that shrinks to its content makes the run jump as you swipe
 * from a full day to an empty one, and how full each day was is the thing you
 * are comparing.
 */
const CARD_HEIGHT = 420;

/**
 * One day, over everything.
 *
 * Rendered through the app's `Portal`, which puts it ABOVE the sheet rather
 * than inside it. Inside, it was bounded by the sheet's own box and the sheet's
 * pan competed for the swipe; a second modal is not an option either, since
 * presenting one dismisses the sheet underneath. The portal is the third way:
 * one overlay, full screen, nothing to fight.
 *
 * The scrim is a real press target, so tapping the dimmed month around the card
 * closes it — which is where anyone will tap first.
 */
export function PlannerDayDialog({
  date,
  days,
  cellsByDay,
  today,
  onSelect,
  onClose,
}: PlannerDayDialogProps) {
  const scrim = useCSSVariable('--color-scrim');

  if (date === null) return null;

  const index = Math.max(0, days.indexOf(date));

  return (
    <Portal>
      <Animated.View
        style={[StyleSheet.absoluteFill, { justifyContent: 'center' }]}
        entering={FadeIn.duration(motion.fast)}
        exiting={FadeOut.duration(motion.fast)}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: asColor(scrim) }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close this day"
        />

        <DayGalleryCarousel
          count={days.length}
          index={index}
          onIndexChange={(next) => {
            const day = days[next];
            if (day) onSelect(day);
          }}
          height={CARD_HEIGHT}
          renderItem={(i) => (
            <PlannerDayCard
              date={days[i]}
              cells={cellsByDay.get(days[i]) ?? []}
              isToday={days[i] === today}
              width={ITEM_WIDTH}
              height={CARD_HEIGHT}
            />
          )}
        />
      </Animated.View>
    </Portal>
  );
}
