import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { Award } from '@/components/icons';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { GoldButton } from '@/components/ui/gold-button';
import { Portal } from '@/components/ui/portal';
import { motion } from '@/constants/theme';
import { asColor } from '@/utils/colors';

type GoalAwardDialogProps = {
  /** The goal just finished, or null when the dialog is closed. */
  title: string | null;
  onClose: () => void;
};

/**
 * The one moment Compass celebrates.
 *
 * This app has no streaks, no ranks and no badges, and that is deliberate:
 * they reward turning up rather than getting anywhere, and they punish the
 * honest week. Finishing a goal is the exception worth marking, because it is
 * the only thing here that is actually finished — the reader set a target
 * months ago and has now reached the end of it.
 *
 * So there is exactly one award in the whole app, it cannot be farmed, and it
 * says what the reader gets to keep rather than what they scored.
 *
 * A portal, like the log note and the planner's day card: it is raised from
 * inside a sheet, and a second modal would dismiss the sheet underneath it.
 */
export function GoalAwardDialog({ title, onClose }: GoalAwardDialogProps) {
  const [primary, mutedForeground, scrim] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
    '--color-scrim',
  ]);
  const gold = asColor(primary);
  const dim = asColor(mutedForeground);

  if (title === null) return null;

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
          accessibilityLabel="Close"
        />

        <View style={{ marginHorizontal: 16 }}>
          <Card>
            <Card.Content className="items-center gap-4 p-6">
              {/* The only thing on the screen that arrives with a flourish,
                  and it grows from nothing rather than sliding in: the award
                  belongs to this moment and did not travel here from
                  somewhere else. */}
              <Animated.View entering={ZoomIn.springify().damping(14).delay(60)}>
                <Award size={44} color={gold} strokeWidth={1.5} />
              </Animated.View>

              <View className="items-center gap-2">
                {/* An exclamation, and the only one in the app. Compass is
                    deliberately flat-voiced everywhere else — no streaks, no
                    ranks, no congratulating you for turning up — and a full
                    stop here was that restraint applied to the one moment it
                    should not apply to. This is the thing that actually got
                    finished; it is allowed to sound pleased. */}
                <ThemedText type="headlineSm" className="text-center">
                  Goal finished!
                </ThemedText>
                <ThemedText type="bodyMd" color={dim} className="text-center">
                  {title}
                </ThemedText>
              </View>

              {/* One line, and no promises about what Samwell will do with
                  it. He keeps the record either way, and the reader meeting
                  that later — in how he sizes the next goal — lands far
                  harder than being told here that he would. */}
              <ThemedText type="bodySm" color={dim} className="text-center">
                Every goal you close out is the next version of you.
              </ThemedText>

              {/* Compact: this button dismisses a dialog, it does not carry
                  the moment. The award and the line above it do that, and a
                  56pt bar under them competed with the thing it was there to
                  acknowledge. */}
              <GoldButton label="GOOD" onPress={onClose} size="compact" />
            </Card.Content>
          </Card>
        </View>
      </Animated.View>
    </Portal>
  );
}
