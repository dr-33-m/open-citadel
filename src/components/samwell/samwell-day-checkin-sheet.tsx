import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { formatCompassDate, scoreColor } from '@/components/compass/format';
import { SamwellMarkdown } from '@/components/compass/samwell-markdown';
import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { spacing } from '@/constants/theme';
import { asColor } from '@/utils/colors';
import type { CompassCheckinRow } from '@/stores/compass';

type SamwellDayCheckinSheetProps = {
  visible: boolean;
  date: string | null;
  checkins: CompassCheckinRow[];
  onClose: () => void;
};

export function SamwellDayCheckinSheet({ visible, date, checkins, onClose }: SamwellDayCheckinSheetProps) {
  // Literal colours for consumers a className can't reach: ThemedText's
  // `color` prop, the score-colour helper's gold input, and the entry
  // divider's hairline border, which has no Tailwind width class.
  const [primary, mutedForeground, border] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
    '--color-border',
  ]);
  return (
    // `maxHeightRatio` is the cap and the only cap — the sheet measures the
    // day's entries and stops there, so the scroll region needs no
    // `maxHeight` of its own.
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.8} scrollable>
      {/* `contentContainerStyle`, not `contentContainerClassName`: Uniwind
          auto-instruments React Native's own components, and this scroll
          region is the library's, so a class name on it has nothing to
          resolve it. */}
      <Sheet.ScrollView
        contentContainerStyle={{ gap: spacing[6], paddingHorizontal: spacing[6] }}
      >
        <ThemedText type="headlineSm">{date ? formatCompassDate(date) : ''}</ThemedText>

        {checkins.length === 0 ? (
          <View className="items-center py-6">
            <ThemedText type="bodySm" color={asColor(mutedForeground)}>
              No check-in logged this day.
            </ThemedText>
          </View>
        ) : (
          checkins.map((checkin, i) => {
            const steps =
              checkin.kind === 'night' && checkin.effortUnitsCompleted != null
                ? `+${Math.round(checkin.effortUnitsCompleted * 10) / 10} steps`
                : null;
            return (
              <View
                key={checkin.id}
                className="gap-2"
                style={
                  i > 0
                    ? {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: asColor(border),
                        paddingTop: spacing[4],
                      }
                    : undefined
                }
              >
                <View className="flex-row items-baseline gap-3">
                  <ThemedText type="labelSm" color={asColor(primary)}>
                    {checkin.kind === 'morning' ? 'MORNING' : 'NIGHT'}
                  </ThemedText>
                  {checkin.focusScore != null && (
                    <ThemedText
                      type="labelSm"
                      color={scoreColor(checkin.focusScore, asColor(primary) ?? '')}
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {checkin.focusScore}% FOCUS
                    </ThemedText>
                  )}
                  {steps && (
                    <ThemedText type="labelSm" color={asColor(mutedForeground)} style={{ fontVariant: ['tabular-nums'] }}>
                      {steps}
                    </ThemedText>
                  )}
                </View>
                {checkin.kind === 'morning' && checkin.missionSummary != null && (
                  <ThemedText type="bodySm" color={asColor(mutedForeground)}>
                    {checkin.missionSummary}
                  </ThemedText>
                )}
                {checkin.pitWallMessage != null && <SamwellMarkdown content={checkin.pitWallMessage} />}
              </View>
            );
          })
        )}
      </Sheet.ScrollView>
    </Sheet>
  );
}
