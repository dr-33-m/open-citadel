import React from 'react';
import { TextInput, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ArrowRight, LibraryBig, Send, Square } from '@/components/icons';
import { GoldButton } from '@/components/ui/gold-button';
import { Touchable } from '@/components/ui/touchable';
import { fontFamily, spacing } from '@/constants/theme';
import { cn } from '@/lib/cn';
import { asColor } from '@/utils/colors';

/**
 * Where the conversation is in its life, which is the only thing this reads.
 *
 * `start` is before a word has been said, and there is deliberately no field
 * there. Somebody who has just installed a reader does not know what to type
 * to a stranger claiming to be their reading companion, and an empty box is
 * the worst possible first prompt. One button that says what happens next is
 * the whole of the first move.
 *
 * `done` has no field either, for the mirror reason: the conversation is over,
 * and a live input under a goodbye invites a message nobody will answer.
 */
export type OnboardingPhase = 'start' | 'talking' | 'done';

/**
 * The one control at the bottom of onboarding, in three states.
 *
 * Memoized, and that is not a reflex. A streaming reply re-renders the screen
 * around this on every token, and without the memo a text field, its
 * placeholder and two buttons were rebuilt sixty times a second to show
 * exactly what they showed before. Its props are a phase, a draft and four
 * callbacks, all of which change when a person does something, never when a
 * token arrives, so the bail-out is close to total.
 *
 * One component rather than three, because they occupy the same place and
 * replace each other. Two of the three are a single full-width `GoldButton`,
 * which is `full` size on purpose: at both of those moments the button IS the
 * screen's purpose, which is exactly what that size is for.
 */
export const OnboardingComposer = React.memo(function OnboardingComposer({
  phase,
  value,
  onChangeText,
  onStart,
  onSend,
  onStop,
  onFinish,
  busy,
  bottomInset,
}: {
  phase: OnboardingPhase;
  value: string;
  onChangeText: (text: string) => void;
  onStart: () => void;
  onSend: () => void;
  onStop: () => void;
  onFinish: () => void;
  /** A reply is being written. The send corner becomes stop. */
  busy: boolean;
  /** The home indicator, so nothing sits under it. */
  bottomInset: number;
}) {
  const [mutedForeground, foreground, primaryForeground] = useCSSVariable([
    '--color-muted-foreground',
    '--color-foreground',
    '--color-primary-foreground',
  ]);

  const paddingBottom = Math.max(bottomInset, spacing[4]);

  if (phase === 'start') {
    return (
      <View
        className="border-t border-border bg-background px-4 pt-4"
        style={{ paddingBottom }}
      >
        <GoldButton
          label="GET STARTED"
          icon={ArrowRight}
          onPress={onStart}
          disabled={busy}
          loading={busy}
        />
      </View>
    );
  }

  if (phase === 'done') {
    return (
      <View
        className="border-t border-border bg-background px-4 pt-4"
        style={{ paddingBottom }}
      >
        <GoldButton label="GO TO MY LIBRARY" icon={LibraryBig} onPress={onFinish} />
      </View>
    );
  }

  const canSend = value.trim().length > 0 && !busy;

  return (
    <View
      className="flex-row items-end gap-2 border-t border-border bg-background px-3 pt-2"
      style={{ paddingBottom: Math.max(bottomInset, spacing[2]) }}
    >
      <TextInput
        className="max-h-[120px] min-h-[40px] flex-1 bg-muted px-3 py-2 text-[15px] text-foreground"
        style={{ fontFamily: fontFamily.sans }}
        placeholder="Reply to Samwell…"
        placeholderTextColor={asColor(mutedForeground)}
        value={value}
        onChangeText={onChangeText}
        multiline
        editable={!busy}
        onSubmitEditing={onSend}
      />

      {/* Send or stop, never both and never neither, exactly as the reading
          composer does it. While a reply is coming the only useful action is
          to call it off. */}
      {busy ? (
        <Touchable
          className="h-10 w-10 items-center justify-center bg-surface-tertiary"
          onPress={onStop}
          accessibilityRole="button"
          accessibilityLabel="Stop generating"
        >
          <Square size={16} color={asColor(foreground)} fill={asColor(foreground)} />
        </Touchable>
      ) : (
        <Touchable
          className={cn(
            'h-10 w-10 items-center justify-center bg-primary',
            !canSend && 'bg-surface-tertiary',
          )}
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Send size={16} color={canSend ? asColor(primaryForeground) : asColor(mutedForeground)} />
        </Touchable>
      )}
    </View>
  );
});
