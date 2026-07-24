import { ChevronDown, ChevronUp } from 'lucide-react-native';
import React from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { formatCompassDate, scoreColor } from '@/components/compass/format';
import { SamwellMarkdown } from '@/components/compass/samwell-markdown';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import type { CompassCheckinRow } from '@/stores/compass';

type RecentSheetProps = {
  visible: boolean;
  onClose: () => void;
  checkins: CompassCheckinRow[];
};

export function RecentSheet({ visible, onClose, checkins }: RecentSheetProps) {
  const colors = useColors();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, justifyContent: 'flex-end' },
        overlay: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
        },
        panel: {
          backgroundColor: colors.surface.low,
          paddingHorizontal: spacing[6],
          paddingTop: spacing[4],
          paddingBottom: spacing[10],
          gap: spacing[4],
          maxHeight: '80%',
        },
        grabber: {
          width: 40,
          height: 4,
          backgroundColor: colors.surface.highest,
          alignSelf: 'center',
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[3],
          paddingVertical: spacing[3],
        },
        date: { width: 64 },
        kind: { width: 68 },
        spacer: { flex: 1 },
        divider: {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.outline.variant,
        },
        detail: {
          paddingBottom: spacing[4],
          gap: spacing[3],
        },
        empty: { paddingVertical: spacing[6], alignItems: 'center' },
      }),
    [colors],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Touchable style={styles.overlay} onPress={onClose} />
        <View style={styles.panel}>
          <View style={styles.grabber} />
          <ThemedText type="labelSm" color={colors.text.secondary}>
            RECENT CHECK-INS
          </ThemedText>

          {checkins.length === 0 ? (
            <View style={styles.empty}>
              <ThemedText type="bodySm" color={colors.text.secondary}>
                No check-ins yet. They will show up here.
              </ThemedText>
            </View>
          ) : (
            <ScrollView>
              {checkins.map((checkin) => {
                const expanded = expandedId === checkin.id;
                const steps =
                  checkin.kind === 'night' && checkin.effortUnitsCompleted != null
                    ? `+${Math.round(checkin.effortUnitsCompleted * 10) / 10}`
                    : null;
                return (
                  <View key={checkin.id} style={styles.divider}>
                    <Touchable
                      style={styles.row}
                      onPress={() => setExpandedId(expanded ? null : checkin.id)}
                    >
                      <ThemedText type="labelSm" color={colors.text.secondary} style={styles.date}>
                        {formatCompassDate(checkin.localDate)}
                      </ThemedText>
                      <ThemedText
                        type="labelSm"
                        color={colors.primary.default}
                        numberOfLines={1}
                        style={styles.kind}
                      >
                        {checkin.kind === 'morning' ? 'MORNING' : 'NIGHT'}
                      </ThemedText>
                      <View style={styles.spacer} />
                      {steps !== null && (
                        <ThemedText type="labelSm" color={colors.text.secondary}>
                          {steps} STEPS
                        </ThemedText>
                      )}
                      {checkin.focusScore != null && (
                        <ThemedText
                          type="labelSm"
                          color={scoreColor(checkin.focusScore, colors.primary.default)}
                        >
                          {checkin.focusScore}%
                        </ThemedText>
                      )}
                      {expanded ? (
                        <ChevronUp size={16} color={colors.text.secondary} />
                      ) : (
                        <ChevronDown size={16} color={colors.text.secondary} />
                      )}
                    </Touchable>

                    {expanded && (
                      <View style={styles.detail}>
                        {checkin.kind === 'morning' && checkin.missionSummary != null && (
                          <ThemedText type="bodySm" color={colors.text.secondary}>
                            {checkin.missionSummary}
                          </ThemedText>
                        )}
                        {checkin.pitWallMessage != null && (
                          <SamwellMarkdown content={checkin.pitWallMessage} />
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
