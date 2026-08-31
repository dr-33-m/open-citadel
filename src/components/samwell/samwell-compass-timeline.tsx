import { FlashList } from '@shopify/flash-list';
import { desc, eq } from 'drizzle-orm';
import { Compass as CompassIcon } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { scoreColor } from '@/components/compass/format';
import { SamwellDayCheckinSheet } from '@/components/samwell/samwell-day-checkin-sheet';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { elevation, spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { compassCheckins } from '@/db/schema';
import { currentCompassDay } from '@/services/compass-day';
import { addDaysYmd, daysBetween } from '@/services/compass-math';
import { asColor } from '@/utils/colors';
import { cn } from '@/lib/cn';
import type { CompassCheckinRow, CompassGoalRow } from '@/stores/compass';

type SamwellCompassTimelineProps = {
  cloudReady: boolean;
  notConfigured: boolean;
  /** Opens Settings, where Samwell's mode is switched. */
  onOpenSettings: () => void;
  goal: CompassGoalRow | null;
};

const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function dowLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return WEEKDAY[new Date(y, m - 1, d).getDay()];
}

const Separator = () => <View className="w-2" />;

/**
 * Compass's own progress timeline for the merged screen: a horizontally
 * scrolling strip of the goal's days (start → target), one cell per day, in
 * place of the earlier cramped progress-bar-with-markers design. Tapping a
 * reachable day (today or earlier) opens that day's check-in in a sheet;
 * future days are shown but dimmed and inert, since there's nothing to open
 * yet. Distinct from `src/components/timeline/*`, which is the reading
 * highlights/thoughts journal on the Timeline tab.
 *
 * Rendered with `FlashList` (already a dependency, used elsewhere in the app)
 * rather than a `ScrollView` mapping every day — a goal can span months, and
 * a plain map was mounting every single cell (border + shadow apiece) up
 * front instead of only the handful actually on screen, which is what made
 * switching into Compass feel slow.
 */
export function SamwellCompassTimeline({ cloudReady, notConfigured, onOpenSettings, goal }: SamwellCompassTimelineProps) {
  // Literal colours for consumers a className can't reach: lucide icon props,
  // ThemedText's `color` prop, and the score-colour helper's gold input.
  const [primary, mutedForeground, primaryForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
    '--color-primary-foreground',
  ]);
  const [checkinsByDate, setCheckinsByDate] = React.useState<Map<string, CompassCheckinRow[]>>(new Map());
  const [openDate, setOpenDate] = React.useState<string | null>(null);

  // Re-queried whenever `goal` changes reference, which `loadCompass()` does
  // on every reload — including right after a check-in is finalized — so a
  // freshly logged day's dot appears without extra wiring.
  React.useEffect(() => {
    if (!goal) {
      setCheckinsByDate(new Map());
      return;
    }
    const rows = db
      .select()
      .from(compassCheckins)
      .where(eq(compassCheckins.goalId, goal.id))
      .orderBy(desc(compassCheckins.localDate))
      .all();
    const map = new Map<string, CompassCheckinRow[]>();
    for (const row of rows) {
      const list = map.get(row.localDate) ?? [];
      list.push(row);
      map.set(row.localDate, list);
    }
    setCheckinsByDate(map);
  }, [goal]);

  const today = currentCompassDay();

  const days = React.useMemo(() => {
    if (!goal?.startDate || !goal?.targetDate) return [];
    const total = Math.max(0, daysBetween(goal.startDate, goal.targetDate));
    return Array.from({ length: total + 1 }, (_, i) => addDaysYmd(goal.startDate!, i));
  }, [goal?.startDate, goal?.targetDate]);

  const todayIndex = days.indexOf(today);

  const renderItem = React.useCallback(
    ({ item: day }: { item: string }) => {
      const isFuture = day > today;
      const isToday = day === today;
      const checkins = checkinsByDate.get(day) ?? [];
      const hasData = checkins.length > 0;
      const dotScore = hasData
        ? (checkins.find((c) => c.kind === 'night') ?? checkins[0]).focusScore
        : null;

      return (
        <Touchable
          // FlashList recycles this view across different days as you scroll,
          // so every branch must be set explicitly on every render — leaving
          // any of these to "fall back" to a base style risks a stale value
          // (e.g. a past "today" border) surviving onto a recycled cell.
          className={cn(
            'w-12 items-center gap-1 bg-card py-2',
            isToday ? 'border-2 border-primary' : 'border border-border',
            isFuture ? 'opacity-35' : 'opacity-100',
          )}
          style={elevation.soft}
          disabled={isFuture}
          onPress={() => setOpenDate(day)}
        >
          <ThemedText type="labelSm" color={asColor(mutedForeground)}>
            {dowLabel(day)}
          </ThemedText>
          <ThemedText type="bodyMd" color={isToday ? asColor(primary) : undefined} style={{ fontVariant: ['tabular-nums'] }}>
            {Number(day.split('-')[2])}
          </ThemedText>
          {hasData ? (
            <View
              className="mt-0.5 h-1.5 w-1.5"
              style={{ backgroundColor: scoreColor(dotScore, asColor(primary) ?? '') }}
            />
          ) : (
            <View className="mt-0.5 h-1.5 w-1.5" />
          )}
        </Touchable>
      );
    },
    [checkinsByDate, today, primary, mutedForeground],
  );

  if (!cloudReady) {
    return (
      <View className="py-4">
        <View className="items-center gap-2 px-5 py-4">
          <CompassIcon size={40} color={asColor(mutedForeground)} style={{ opacity: 0.3 }} />
          <ThemedText type="bodySm" color={asColor(mutedForeground)} className="text-center">
            {notConfigured
              ? 'Set one goal and reach it, with Grand Maester Samwell helping you stay on track. He is not set up in this build yet.'
              : 'Set one goal and reach it. Grand Maester Samwell breaks it into a plan, tracks your progress, and tells you what to focus on each day. Switch to Cloud to begin.'}
          </ThemedText>
          {/* Only when there is somewhere useful to go: with no cloud
              configured at all, Settings has nothing to switch to. */}
          {!notConfigured && (
            <Touchable className="mt-1 bg-primary px-4 py-2" onPress={onOpenSettings}>
              <ThemedText type="labelSm" color={asColor(primaryForeground)}>
                GO TO SETTINGS
              </ThemedText>
            </Touchable>
          )}
        </View>
      </View>
    );
  }

  if (!goal || !goal.startDate || !goal.targetDate) {
    return (
      <View className="py-4">
        <View className="items-center gap-2 px-5 py-4">
          <CompassIcon size={40} color={asColor(mutedForeground)} style={{ opacity: 0.3 }} />
          <ThemedText type="bodySm" color={asColor(mutedForeground)} className="text-center">
            Tell Samwell what you want to achieve in the field below to set your first goal.
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View className="py-4">
      <FlashList
        data={days}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(day) => day}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={{ paddingHorizontal: spacing[4] }}
        // A little past context stays visible rather than jamming "today"
        // against the left edge.
        initialScrollIndex={todayIndex > 0 ? todayIndex - 2 : undefined}
        // This list is a static, one-shot range of days — it never has
        // content prepended/appended while the user is scrolling, which is
        // the only case this feature (on by default) is for. Left on, it
        // was the likely cause of the scroll "blipping" back near the start
        // of the list.
        maintainVisibleContentPosition={{ disabled: true }}
      />

      <SamwellDayCheckinSheet
        visible={openDate !== null}
        date={openDate}
        checkins={openDate ? checkinsByDate.get(openDate) ?? [] : []}
        onClose={() => setOpenDate(null)}
      />
    </View>
  );
}
