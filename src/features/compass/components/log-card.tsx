import React from 'react';
import { View } from 'react-native';
import { Check, Clock, Goal, X } from 'lucide-react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Touchable } from '@/components/ui/touchable';
import { LogControl } from '@/features/compass/components/log-control';
import { defaultLogValue, needsValue } from '@/services/measurement';
import { scheduleSummary, type DueItem } from '@/services/occurrences';
import { asColor } from '@/utils/colors';

type LogCardProps = {
  item: DueItem;
  value: number | null;
  onChangeValue: (next: number | null) => void;
  onDone: () => void;
  onMissed: () => void;
  onSkip: () => void;
  /** Already snoozed, so the clock un-snoozes instead of snoozing again. */
  snoozed?: boolean;
};

/**
 * One activity, waiting to be answered.
 *
 * Three outcomes in one row of icons, weighted by how often each is the right
 * answer: a wide gold tick in the middle for done, a cross on the left for
 * didn't happen, a clock on the right for later. Most days the answer is the
 * middle one, so it is the one the thumb lands on without aiming, and the two
 * that carry a cost to press are deliberately smaller and off to the sides.
 *
 * Every action keeps its own accessibility label, because a row of three
 * unlabelled glyphs says nothing to a screen reader.
 */
export function LogCard({
  item,
  value,
  onChangeValue,
  onDone,
  onMissed,
  onSkip,
  snoozed = false,
}: LogCardProps) {
  const [primary, primaryForeground, mutedForeground, foreground, border] = useCSSVariable([
    '--color-primary',
    '--color-primary-foreground',
    '--color-muted-foreground',
    '--color-foreground',
    '--color-border',
  ]);
  const muted = asColor(mutedForeground);
  const { trackable } = item;

  const subtitle = [
    item.periodLabel ?? scheduleSummary(trackable.schedule).toUpperCase(),
    trackable.timeOfDay,
  ]
    .filter(Boolean)
    .join(' · ');

  // Done stays inert until there is something to record. A stepper opens on
  // the target, so those are one tap away; an amount and a rating open empty
  // on purpose, and Done before a value would write a log that can never
  // satisfy its own measurement.
  const canConfirm =
    !needsValue(trackable.measurement) ||
    value != null ||
    defaultLogValue(trackable.measurement) != null;

  // Every card fills the deck's full height, and the actions are pinned to the
  // bottom of it. Left to size themselves, a bare completion card and one
  // carrying a duration stepper differ by a hundred points, so the cards behind
  // the top one stick out above and below it — the pile stops reading as a pile
  // and starts reading as three overlapping cards with two sets of buttons.
  return (
    <Card className="h-full w-full">
      <Card.Content className="flex-1 gap-5 p-5">
        <View className="gap-2">
          <ThemedText type="labelSm" color={asColor(primary)}>
            {subtitle}
          </ThemedText>
          <ThemedText type="headlineSm">{trackable.title}</ThemedText>
          {trackable.description && (
            <ThemedText type="bodySm" color={muted}>
              {trackable.description}
            </ThemedText>
          )}
        </View>

        <View className="flex-1 items-center justify-center">
          {/* A completion has no control — the tick below IS the input — so the
              middle of the card would otherwise be a large empty rectangle.
              The mark fills it without pretending to be pressable: it is set
              faint, at the border's weight, so it reads as the card's own
              texture rather than a button that does nothing. */}
          {trackable.measurement.type === 'COMPLETION' ? (
            <Goal size={72} color={asColor(border)} strokeWidth={1.5} />
          ) : (
            <LogControl
              measurement={trackable.measurement}
              value={value}
              onChange={onChangeValue}
            />
          )}
        </View>

        <View className="flex-row items-center gap-2">
          <Touchable
            className="h-14 w-14 items-center justify-center border border-border"
            onPress={onMissed}
            accessibilityRole="button"
            accessibilityLabel="This did not happen"
          >
            <X size={22} color={muted} strokeWidth={2} />
          </Touchable>

          <Touchable
            className="h-14 flex-1 items-center justify-center"
            style={{
              backgroundColor: asColor(canConfirm ? primary : undefined),
              opacity: canConfirm ? 1 : 0.4,
            }}
            onPress={canConfirm ? onDone : undefined}
            haptic="commit"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canConfirm }}
            accessibilityLabel="Done"
          >
            <Check
              size={28}
              color={asColor(canConfirm ? primaryForeground : foreground)}
              strokeWidth={2}
            />
          </Touchable>

          <Touchable
            className="h-14 w-14 items-center justify-center border border-border"
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel={snoozed ? 'Put back in today' : 'Later'}
          >
            <Clock
              size={22}
              color={asColor(snoozed ? primary : mutedForeground)}
              strokeWidth={2}
            />
          </Touchable>
        </View>
      </Card.Content>
    </Card>
  );
}
