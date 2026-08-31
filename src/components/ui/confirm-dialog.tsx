import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { easing, motion, spacing } from '@/constants/theme';

/** `useCSSVariable` can resolve to a number for a non-colour token; these are
 * always colours, so anything else collapses to `undefined` rather than
 * being passed on to a prop that expects a colour string. */
function asColor(value: string | number | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export type DialogAction = {
  label: string;
  onPress: () => void;
  /**
   * The action being confirmed. Filled and emphasised, and always placed
   * last so it sits on the right — the same position DELETE holds in the
   * delete dialog, so the confirming button never moves between dialogs.
   * Gold by default, or the destructive red when `destructive` is set.
   */
  confirm?: boolean;
  /** A confirm action that destroys something. Implies `confirm`. */
  destructive?: boolean;
};

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  /** Optional supporting line — the subject of the action, usually. */
  message?: string;
  actions: DialogAction[];
  /** Work is under way: actions are held, and a spinner prefixes the title. */
  busy?: boolean;
  onClose: () => void;
};

/**
 * A centred confirmation dialog.
 *
 * For decisions that need an answer before anything else happens. A bottom
 * sheet is the wrong shape here: it reads as a place to browse, and it can be
 * dismissed by the same downward flick used to scroll, which is too casual a
 * gesture to sit next to a destructive action.
 */
export function ConfirmDialog({ visible, title, message, actions, busy, onClose }: ConfirmDialogProps) {
  // Literal colours, not className: ThemedText's/ActivityIndicator's `color`
  // prop both take a resolved value, not a class. `Touchable` needs the same
  // treatment here — it wraps AnimatedPressable, which (unlike a plain View
  // or PanelUI's own components) never destructures `className`, so passing
  // one would silently style nothing.
  const [
    mutedForeground,
    destructiveForeground,
    primaryForeground,
    primary,
    destructive,
    border,
    scrim,
  ] = useCSSVariable([
    '--color-muted-foreground',
    '--color-destructive-foreground',
    '--color-primary-foreground',
    '--color-primary',
    '--color-destructive',
    '--color-border',
    '--color-scrim',
  ]);

  const actionStyle = React.useMemo(
    () => ({
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[2],
      backgroundColor: 'transparent' as const,
      borderWidth: 1,
      borderColor: asColor(border),
    }),
    [border],
  );
  const actionConfirmStyle = React.useMemo(
    () => ({
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[2],
      backgroundColor: asColor(primary),
      borderWidth: 1,
      borderColor: asColor(primary),
    }),
    [primary],
  );
  const actionDestructiveStyle = React.useMemo(
    () => ({
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[2],
      backgroundColor: asColor(destructive),
      borderWidth: 1,
      borderColor: asColor(destructive),
    }),
    [destructive],
  );

  // Confirming actions are pulled to the end regardless of the order the
  // caller listed them in, so the button that commits is always rightmost.
  const ordered = React.useMemo(() => {
    const isConfirm = (a: DialogAction) => Boolean(a.confirm || a.destructive);
    return [...actions.filter((a) => !isConfirm(a)), ...actions.filter(isConfirm)];
  }, [actions]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={busy ? undefined : onClose}>
      <Animated.View
        entering={FadeIn.duration(motion.fast).easing(easing)}
        exiting={FadeOut.duration(motion.fast).easing(easing)}
        style={StyleSheet.absoluteFill}
      >
        {/* Tapping outside cancels, matching the hardware back button. The
            dim is `--color-scrim`, the same token every other overlay uses —
            it was a hardcoded `rgba(0,0,0,0.6)`, which in a dark theme is the
            wrong direction and pulled the whole page a long way past its own
            background and back again on dismiss. Inline rather than a class
            because this is inside an RN `Modal`, whose own view tree the
            theme's classes do not reach the same way. */}
        <Pressable
          className="flex-1 items-center justify-center p-6"
          style={{ backgroundColor: asColor(scrim) }}
          onPress={busy ? undefined : onClose}
        >
          {/* Swallows taps so they don't fall through to the backdrop. */}
          <Pressable className="w-full max-w-[380px] gap-3 border border-border bg-popover p-6" onPress={() => {}}>
            <View className="flex-row items-center gap-3">
              {busy && <ActivityIndicator color={asColor(primary)} />}
              <ThemedText type="headlineSm" style={{ flexShrink: 1 }}>
                {title}
              </ThemedText>
            </View>
            {message && (
              <ThemedText type="bodySm" color={asColor(mutedForeground)} numberOfLines={3}>
                {message}
              </ThemedText>
            )}
            {/* Nothing to act on while busy — the spinner by the title already
                says so, so the row is dropped rather than left holding a
                second, redundant spinner. */}
            {!busy && ordered.length > 0 && (
              <View className="mt-2 flex-row justify-end gap-2">
                {ordered.map((action) => (
                  <Touchable
                    key={action.label}
                    style={
                      action.destructive
                        ? actionDestructiveStyle
                        : action.confirm
                          ? actionConfirmStyle
                          : actionStyle
                    }
                    onPress={action.onPress}
                  >
                    <ThemedText
                      type="labelSm"
                      color={asColor(
                        action.destructive
                          ? destructiveForeground
                          : action.confirm
                            ? primaryForeground
                            : mutedForeground
                      )}
                    >
                      {action.label}
                    </ThemedText>
                  </Touchable>
                ))}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}
