import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { withUniwind } from 'uniwind';

import { AnimatedPressable, type AnimatedPressableProps } from '@/components/ui/animated-pressable';
import { haptics } from '@/utils/haptics';

interface TouchableProps extends Omit<AnimatedPressableProps, 'style' | 'pressScale' | 'pressOpacity'> {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Fires when the press commits, not on touch-down. Off by default —
   * reserved for moments that actually change something, not every tap. */
  haptic?: keyof typeof haptics | false;
  /** Fires the moment the long-press threshold is reached. Defaults to
   * `commit` whenever `onLongPress` is set: a long press has no visual
   * feedback of its own until the menu appears, so the thump IS the
   * confirmation that the hold registered — the same thing iOS does for a
   * native context menu. Pass `false` to opt a specific one out. */
  longPressHaptic?: keyof typeof haptics | false;
}

/**
 * The app's universal press primitive, built on PanelUI's `AnimatedPressable`
 * — a UI-thread scale/opacity spring on press, confirmed on-device to not
 * reproduce the touch-responder regression an earlier hand-rolled attempt at
 * this same idea had (see git history: `createAnimatedComponent(Pressable)`
 * + `useSharedValue`/`useAnimatedStyle` once dropped taps across re-renders
 * under rapid input). `pressOpacity={0.6}` keeps the house dim the whole app
 * already reads as "pressed"; the scale is AnimatedPressable's own default.
 */
function TouchableBase({
  style,
  children,
  haptic = false,
  longPressHaptic = 'commit',
  onPress,
  onLongPress,
  ...props
}: TouchableProps) {
  // Pressable fires `onPress` on release regardless of whether `onLongPress`
  // already fired for the same touch — without this, a long-press action
  // (e.g. clearing something) is immediately followed by the tap action
  // (e.g. opening it back up) on the same gesture.
  const longPressFired = React.useRef(false);

  return (
    <AnimatedPressable
      {...props}
      pressOpacity={0.6}
      style={style}
      onPress={(event) => {
        if (longPressFired.current) {
          longPressFired.current = false;
          return;
        }
        if (haptic) haptics[haptic]();
        onPress?.(event);
      }}
      // Only attached when the caller actually handles a long press —
      // defining it unconditionally would make every button swallow its
      // `onPress` after a half-second hold.
      onLongPress={
        onLongPress &&
        ((event) => {
          longPressFired.current = true;
          if (longPressHaptic) haptics[longPressHaptic]();
          onLongPress(event);
        })
      }
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * `className` does not work on a custom component just because it wraps a
 * host primitive — Uniwind only auto-instruments React Native's own built-ins
 * (View, Text, Pressable, ...), not third-party or app components. `Touchable`
 * wraps AnimatedPressable, which wraps a Reanimated-animated Pressable, two
 * layers removed from anything Uniwind recognizes on its own. `withUniwind`
 * retrofits that support once, here, so every call site can use `className`
 * directly instead of resolving tokens by hand at each one.
 */
export const Touchable = withUniwind(TouchableBase);
