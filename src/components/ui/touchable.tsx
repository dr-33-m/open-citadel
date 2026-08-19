import React from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '@/utils/haptics';

interface TouchableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
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
 * The app's universal press primitive.
 *
 * Deliberately a plain `Pressable` with a style function: press feedback is a
 * two-state toggle, which is the one case that must NOT become a worklet. An
 * earlier pass wrapped this in `createAnimatedComponent(Pressable)` with a
 * `useSharedValue`/`useAnimatedStyle` pair — that broke the touch responder
 * across re-renders (taps stopped registering until pressed repeatedly) and
 * put a worklet on every tappable surface in the app, which made the whole UI
 * sluggish. Feedback here stays instant and free; the app's animation budget
 * is spent on entrances and state changes instead.
 */
export function Touchable({
  style,
  children,
  haptic = false,
  longPressHaptic = 'commit',
  onPress,
  onLongPress,
  ...props
}: TouchableProps) {
  return (
    <Pressable
      {...props}
      onPress={(event) => {
        if (haptic) haptics[haptic]();
        onPress?.(event);
      }}
      // Only attached when the caller actually handles a long press —
      // defining it unconditionally would make every button swallow its
      // `onPress` after a half-second hold.
      onLongPress={
        onLongPress &&
        ((event) => {
          if (longPressHaptic) haptics[longPressHaptic]();
          onLongPress(event);
        })
      }
      style={({ pressed }) => {
        const base = typeof style === 'function' ? style({ pressed }) : style;
        return [base, pressed && { opacity: 0.6 }];
      }}
    >
      {children}
    </Pressable>
  );
}
