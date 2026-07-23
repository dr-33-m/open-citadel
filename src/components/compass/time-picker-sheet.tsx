import { ChevronDown, ChevronUp } from 'lucide-react-native';
import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { Touchable } from '@/components/ui/touchable';
import { spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

const MINUTE_STEPS = [0, 15, 30, 45];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseValue(value: string): { hour: number; minuteIndex: number } {
  const [rawHour, rawMinute] = value.split(':').map(Number);
  const hour = Number.isFinite(rawHour) ? Math.min(23, Math.max(0, rawHour)) : 8;
  const minute = Number.isFinite(rawMinute) ? rawMinute : 0;
  const nearest = MINUTE_STEPS.reduce(
    (best, step, index) =>
      Math.abs(step - minute) < Math.abs(MINUTE_STEPS[best] - minute) ? index : best,
    0,
  );
  return { hour, minuteIndex: nearest };
}

type TimePickerSheetProps = {
  visible: boolean;
  label: string;
  value: string;
  onSelect: (next: string) => void;
  onClose: () => void;
};

export function TimePickerSheet({ visible, label, value, onSelect, onClose }: TimePickerSheetProps) {
  const colors = useColors();
  const [hour, setHour] = React.useState(8);
  const [minuteIndex, setMinuteIndex] = React.useState(0);

  React.useEffect(() => {
    if (visible) {
      const parsed = parseValue(value);
      setHour(parsed.hour);
      setMinuteIndex(parsed.minuteIndex);
    }
  }, [visible, value]);

  const styles = React.useMemo(() => StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: 'flex-end',
    },
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
    steppers: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing[4],
    },
    stepperColumn: {
      alignItems: 'center',
      gap: spacing[2],
    },
    stepButton: {
      width: 44,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    readout: {
      minWidth: 72,
      textAlign: 'center',
    },
  }), [colors]);

  const confirm = () => {
    onSelect(`${pad2(hour)}:${pad2(MINUTE_STEPS[minuteIndex])}`);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Touchable style={styles.overlay} onPress={onClose} />
        <View style={styles.panel}>
          <View style={styles.grabber} />
          <ThemedText type="labelSm" color={colors.primary.default}>
            {label}
          </ThemedText>

          <View style={styles.steppers}>
            <View style={styles.stepperColumn}>
              <Touchable style={styles.stepButton} onPress={() => setHour((h) => (h + 1) % 24)}>
                <ChevronUp size={20} color={colors.text.secondary} />
              </Touchable>
              <ThemedText type="displayLg" style={styles.readout}>
                {pad2(hour)}
              </ThemedText>
              <Touchable style={styles.stepButton} onPress={() => setHour((h) => (h + 23) % 24)}>
                <ChevronDown size={20} color={colors.text.secondary} />
              </Touchable>
            </View>

            <ThemedText type="displayLg" color={colors.text.secondary}>
              :
            </ThemedText>

            <View style={styles.stepperColumn}>
              <Touchable
                style={styles.stepButton}
                onPress={() => setMinuteIndex((i) => (i + 1) % MINUTE_STEPS.length)}
              >
                <ChevronUp size={20} color={colors.text.secondary} />
              </Touchable>
              <ThemedText type="displayLg" style={styles.readout}>
                {pad2(MINUTE_STEPS[minuteIndex])}
              </ThemedText>
              <Touchable
                style={styles.stepButton}
                onPress={() =>
                  setMinuteIndex((i) => (i + MINUTE_STEPS.length - 1) % MINUTE_STEPS.length)
                }
              >
                <ChevronDown size={20} color={colors.text.secondary} />
              </Touchable>
            </View>
          </View>

          <GoldButton label="SET TIME" onPress={confirm} />
        </View>
      </View>
    </Modal>
  );
}
