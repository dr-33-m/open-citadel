import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

export type EngineMode = 'offline' | 'cloud';

type EngineInfo = {
  label: string;
  persona: string;
  points: string[];
};

const CONTENT: Record<EngineMode, EngineInfo> = {
  offline: {
    label: 'OFFLINE',
    persona: 'Samwell on your device.',
    points: [
      'He runs entirely on your device. Nothing you say leaves your phone.',
      'Works anywhere, with no internet.',
      'No usage limits, and free.',
      'He is bound by your phone, so he uses a smaller model than the cloud.',
      'Compass is not available offline.',
    ],
  },
  cloud: {
    label: 'CLOUD',
    persona: 'Grand Maester Samwell in the cloud.',
    points: [
      'In the cloud, Samwell becomes Grand Maester Samwell, running the largest models.',
      'Deeper thinking and sharper insight than any phone can manage.',
      'Compass is only available here, with Grand Maester Samwell.',
      'Needs an internet connection. Only what each request needs is sent, nothing more.',
    ],
  },
};

export function EngineInfoSheet({ mode, onClose }: { mode: EngineMode | null; onClose: () => void }) {
  const colors = useColors();

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
        },
        grabber: {
          width: 40,
          height: 4,
          backgroundColor: colors.surface.highest,
          alignSelf: 'center',
        },
        header: { gap: spacing[1] },
        points: { gap: spacing[3] },
        point: { flexDirection: 'row', gap: spacing[3] },
        dot: {
          width: 4,
          height: 4,
          marginTop: 7,
          backgroundColor: colors.primary.default,
        },
        pointText: { flex: 1 },
      }),
    [colors],
  );

  const info = mode ? CONTENT[mode] : null;

  return (
    <Modal visible={mode !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Touchable style={styles.overlay} onPress={onClose} />
        {info && (
          <View style={styles.panel}>
            <View style={styles.grabber} />
            <View style={styles.header}>
              <ThemedText type="labelSm" color={colors.primary.default}>
                {info.label}
              </ThemedText>
              <ThemedText type="headlineSm">{info.persona}</ThemedText>
            </View>
            <View style={styles.points}>
              {info.points.map((point) => (
                <View key={point} style={styles.point}>
                  <View style={styles.dot} />
                  <ThemedText type="bodySm" color={colors.text.secondary} style={styles.pointText}>
                    {point}
                  </ThemedText>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}
