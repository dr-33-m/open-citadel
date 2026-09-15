import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { FieldHint } from '@/components/field-hint';
import { Portal } from '@/components/ui/portal';
import { NOTE_HINTS } from '@/lib/note-hints';
import { useTextValidity } from '@/hooks/use-text-validity';
import { GoalStopReason } from '@/lib/text-fields';
import { Touchable } from '@/components/ui/touchable';
import { fontFamily, motion } from '@/constants/theme';
import { asColor } from '@/utils/colors';

type GoalAbandonDialogProps = {
  /** The goal being retired, or null when the dialog is closed. */
  title: string | null;
  /** The reason, handed up once, on confirm. */
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

/**
 * Retiring a goal, and saying why.
 *
 * The reason is the point of this dialog. A dropped goal and a finished one
 * look nearly identical in the numbers — both stop having logs — and the
 * difference between "the plan was wrong" and "this stopped mattering to me"
 * is the single most useful thing Samwell could know the next time something
 * like it comes up. No amount of logged data reconstructs it, and nobody will
 * remember it in four months.
 *
 * So it is required, and STOP THIS GOAL stays inert until there is something
 * in the field. That is a reversal — it was optional at first, on the argument
 * that holding a goal hostage to a paragraph is how dead goals end up sitting
 * in the list forever. What settled it is that a goal is stopped once. One
 * line, at the one moment the answer is still in the room, is worth asking for.
 *
 * The field's text lives here rather than in a ref belonging to whichever
 * sheet raised the dialog. Two screens were each keeping their own mirror of
 * it, resetting it by hand on open, and reading it back on confirm — three
 * places to get one string wrong. It is handed up once, on confirm.
 */
export function GoalAbandonDialog({
  title,
  onConfirm,
  onCancel,
}: GoalAbandonDialogProps) {
  const [destructive, mutedForeground, foreground, scrim, primary, destructiveOn] =
    useCSSVariable([
      '--color-destructive',
      '--color-muted-foreground',
      '--color-foreground',
      '--color-scrim',
      '--color-primary',
      '--color-destructive-solid-foreground',
    ]);

  /*
   * Uncontrolled, like every field in the app's sheets: the text lives in the
   * native buffer and React only mirrors it out. `useTextValidity` adds the
   * one derived fact the button needs without making a keystroke re-render
   * this dialog — it sets state only when the field crosses empty.
   *
   * Nothing resets any of this between goals, because nothing has to: the
   * callers give this component a `key` per goal, so a different goal is a
   * different instance with an empty mirror, a fresh buffer and a button that
   * starts inert. Clearing it by hand meant writing a ref during render, which
   * is the one thing render is not allowed to do.
   */
  const reason = React.useRef('');
  const { isValid, check } = useTextValidity(GoalStopReason);

  if (title === null) return null;

  const muted = asColor(mutedForeground);

  return (
    <Portal>
      <Animated.View
        style={[StyleSheet.absoluteFill, { justifyContent: 'center' }]}
        entering={FadeIn.duration(motion.fast)}
        exiting={FadeOut.duration(motion.fast)}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: asColor(scrim) }]}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Keep the goal"
        />

        <KeyboardAvoider style={{ marginHorizontal: 16 }}>
          <Card>
            <Card.Content className="gap-4 p-5">
              <View className="gap-1">
                <ThemedText type="labelSm" color={asColor(destructive)}>
                  STOPPING THIS GOAL
                </ThemedText>
                <ThemedText type="headlineSm">{title}</ThemedText>
                <ThemedText type="bodySm" color={muted}>
                  What made you stop?
                </ThemedText>
              </View>

              {/* Uncontrolled, like every field in the app's sheets: the text
                  lives in the native buffer and React only mirrors it out.
                  Controlled, a keystroke landing mid-render is committed over
                  by a stale string and the letter drops.

                  No autoFocus: the keyboard opens on a tap. Someone who opened
                  this to read what it asks should be able to back out without
                  dismissing a keyboard first. */}
              <TextInput
                className="min-h-24 border border-border p-3"
                style={{
                  fontFamily: fontFamily.sans,
                  fontSize: 16,
                  lineHeight: 24,
                  color: asColor(foreground),
                  textAlignVertical: 'top',
                }}
                multiline
                placeholder="The plan was wrong for my week."
                placeholderTextColor={muted}
                defaultValue=""
                onChangeText={(next) => {
                  reason.current = next;
                  check(next);
                }}
                accessibilityLabel="Why you are stopping"
              />

              <FieldHint>{NOTE_HINTS.goalStopped}</FieldHint>

              {/*
                Keeping the goal comes first and carries the gold.

                The filled gold bar used to sit on STOP, which made the
                destructive choice the loudest thing in the dialog and the one
                a thumb lands on by muscle memory. That is backwards: this
                sheet opens the moment somebody is wobbling, and the app's
                whole argument is that a goal is worth more than the urge to
                drop it on a bad Tuesday. So the safe path leads and is the
                only thing wearing the accent.

                Stopping stays available, immediately below, in the app's
                ordinary button and its destructive colour — never hidden and
                never gated, because a goal that cannot be stopped gets
                abandoned silently instead and the journal loses the reason.
              */}
              <View className="gap-2">
                <Touchable
                  className="items-center border border-primary py-3"
                  onPress={onCancel}
                  haptic="select"
                  accessibilityRole="button"
                  accessibilityLabel="Keep the goal"
                >
                  <ThemedText type="labelMd" color={asColor(primary)}>
                    KEEP IT
                  </ThemedText>
                </Touchable>
                {/* Filled, not outlined. Two outlined buttons stacked read as
                    a pair of equal options with one tinted red; a solid one
                    reads as the thing that actually happens. It stays second
                    because keeping the goal is the recommended path, not
                    because stopping is meant to be hard to find.

                    `destructive-solid-foreground` and not `destructive`: the
                    label sits ON the red now, and the token exists for exactly
                    that. */}
                <Touchable
                  disabled={!isValid}
                  onPress={() => onConfirm(reason.current.trim())}
                  haptic="warn"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !isValid }}
                  accessibilityLabel="Stop this goal"
                >
                  {/*
                    The fill and the fade live on an inner view, not on the
                    Touchable.
                    `AnimatedPressable` drives `opacity` from the UI thread for
                    its press feedback, and Reanimated writes animated props
                    straight onto the native view — so any static opacity on
                    the pressable itself is overwritten every frame, whatever
                    order the style array is in. Twice I set it there and twice
                    the button stayed at full strength. One level in, nothing
                    is animating it.
                  */}
                  <View
                    className="items-center bg-destructive py-3"
                    style={isValid ? undefined : { opacity: 0.35 }}
                  >
                    <ThemedText type="labelMd" color={asColor(destructiveOn)}>
                      STOP THIS GOAL
                    </ThemedText>
                  </View>
                </Touchable>
              </View>
            </Card.Content>
          </Card>
        </KeyboardAvoider>
      </Animated.View>
    </Portal>
  );
}
