import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { GoldButton } from '@/components/ui/gold-button';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { Portal } from '@/components/ui/portal';
import { Touchable } from '@/components/ui/touchable';
import { fontFamily, motion } from '@/constants/theme';
import { asColor } from '@/utils/colors';

type LogNoteDialogProps = {
  /** What happened, which decides what the dialog asks. Null closes it. */
  outcome: 'done' | 'missed' | null;
  title: string;
  /** The card being answered. Changing it gives the field a fresh buffer. */
  fieldKey: string;
  onChangeText: (next: string) => void;
  onSave: () => void;
  onSkip: () => void;
};

/**
 * The journal, written one log at a time.
 *
 * One dialog for both outcomes, because a note on a win is worth as much as a
 * note on a miss: what you overcame to do it is exactly what you will need to
 * read the next time it is hard, and a journal that only records failures is a
 * record of failures.
 *
 * SKIP is a first-class action, not a dismissal. Holding an outcome hostage to
 * typing is how logging stops happening on the days it matters most. Tapping
 * the dimmed deck around the card skips too — the outcome was already chosen
 * on the card, so there is nothing here to cancel, only a note to decline.
 *
 * ## Why a portal, and not a sheet or a panel
 *
 * It was a second `Sheet` first, and that was wrong twice: presenting a second
 * modal dismissed the deck underneath, so answering one card dropped you back
 * to the chat, and dismissing after a save re-ran the save from a stale closure
 * and wrote TWO log rows for one tap. Then it was a panel rendered in place of
 * the deck, which fixed both but replaced the whole surface for one optional
 * question — you lost your place on every single card.
 *
 * A portal is the third way. It draws ABOVE the deck's sheet while the deck
 * stays exactly where it was, so answering the note returns you to the same
 * pile rather than to a rebuilt one, and there is still only one modal and one
 * commit.
 */
export function LogNoteDialog({
  outcome,
  title,
  fieldKey,
  onChangeText,
  onSave,
  onSkip,
}: LogNoteDialogProps) {
  const [primary, mutedForeground, foreground, scrim] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
    '--color-foreground',
    '--color-scrim',
  ]);
  if (outcome === null) return null;

  const muted = asColor(mutedForeground);
  const prompt = outcome === 'missed' ? 'What got in the way?' : 'What did it take to do it?';
  const placeholder =
    outcome === 'missed'
      ? 'Editing ran long again.'
      : 'Did it before work, when I still had the energy.';

  return (
    <Portal>
      <Animated.View
        style={[StyleSheet.absoluteFill, { justifyContent: 'center' }]}
        entering={FadeIn.duration(motion.fast)}
        exiting={FadeOut.duration(motion.fast)}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: asColor(scrim) }]}
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip the note"
        />

        {/* The card lifts off the keyboard, not the whole overlay, so the
            scrim keeps covering the screen while the note travels. */}
        <KeyboardAvoider style={{ marginHorizontal: 16 }}>
          <Card>
            <Card.Content className="gap-4 p-5">
              <View className="gap-1">
                <ThemedText type="labelSm" color={asColor(primary)}>
                  {outcome === 'missed' ? "DIDN'T HAPPEN" : 'LOGGED'}
                </ThemedText>
                <ThemedText type="headlineSm">{title}</ThemedText>
                <ThemedText type="bodySm" color={muted}>
                  {prompt}
                </ThemedText>
              </View>

              {/* Uncontrolled, like every other field in the app's sheets: the
                  text lives in the native buffer and React only mirrors it out
                  (`onChangeText`), never back in. Controlled, every keystroke
                  re-set the field from JS state while the deck sheet around it
                  was re-rendering, and letters that landed mid-render were
                  committed over by a stale string — they dropped, or the IME
                  re-inserted them and the word duplicated. The key is what
                  empties it: the buffer is the field's, so it takes a remount
                  to clear, and one card's note must never open on the next.

                  No autoFocus: the keyboard opens on an explicit tap, never on
                  the dialog arriving. Skipping should not cost a dismissal. */}
              <TextInput
                key={fieldKey}
                className="min-h-28 border border-border p-3"
                style={{
                  fontFamily: fontFamily.sans,
                  fontSize: 16,
                  lineHeight: 24,
                  color: asColor(foreground),
                  textAlignVertical: 'top',
                }}
                multiline
                placeholder={placeholder}
                placeholderTextColor={muted}
                defaultValue=""
                onChangeText={onChangeText}
                accessibilityLabel="Note"
              />

              <View className="gap-2">
                <GoldButton label="SAVE THE NOTE" onPress={onSave} />
                <Touchable
                  className="items-center py-3"
                  onPress={onSkip}
                  accessibilityRole="button"
                  accessibilityLabel="Skip the note"
                >
                  <ThemedText type="labelMd" color={muted}>
                    SKIP THE NOTE
                  </ThemedText>
                </Touchable>
              </View>
            </Card.Content>
          </Card>
        </KeyboardAvoider>
      </Animated.View>
    </Portal>
  );
}
