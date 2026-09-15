import { forwardRef, useEffect } from 'react';
import { Pressable, View, type PressableProps } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { tv, type VariantProps } from 'tailwind-variants';
import { useDirectionSign } from '@/hooks/use-direction';
import { getNativeUI } from '@/lib/native';
import { selectionTick } from '@/lib/haptics';
import { useFieldLabelledBy } from '@/components/ui/field';

const SPRING = { damping: 18, stiffness: 250, mass: 0.5 } as const;

const switchVariants = tv({
  slots: {
    track: 'justify-center rounded-full border border-transparent bg-input p-[3px]',
    activeTrack: 'absolute inset-0 rounded-full bg-primary',
    thumb: 'rounded-full bg-white shadow-sm',
  },
  variants: {
    size: {
      sm: { track: 'h-6 w-10', thumb: 'h-4 w-4' },
      md: { track: 'h-7 w-12', thumb: 'h-5 w-5' },
    },
    disabled: {
      true: { track: 'opacity-50' },
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

const TRAVEL: Record<'sm' | 'md', number> = { sm: 16, md: 20 };

/**
 * Room around each track so the target reaches 48dp on both axes.
 *
 * Slop rather than a bigger box, because a box is layout: a switch sized to
 * its target would stand 48dp tall in every row it has ever been placed in,
 * and the tracks are only 24 and 28 tall. The `md` track is already 48 wide,
 * which is why the horizontal figures differ between the two sizes.
 */
const SWITCH_HIT_SLOP: Record<'sm' | 'md', { top: number; bottom: number; left: number; right: number }> = {
  sm: { top: 12, bottom: 12, left: 4, right: 4 },
  md: { top: 10, bottom: 10, left: 0, right: 0 },
};

export interface SwitchProps
  extends VariantProps<typeof switchVariants>,
    Pick<PressableProps, 'accessibilityLabel' | 'accessibilityHint' | 'accessibilityLabelledBy'> {
  className?: string;
  value: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
  /**
   * Render the platform's own switch instead of this one. Requires the
   * optional `@expo/ui` package; without it this prop does nothing.
   *
   * **Theme tokens do not apply** — the platform draws the control, so
   * `className` and `size` are ignored.
   */
  native?: boolean;
  /** Names the control to assistive technology; native mode also draws it. */
  label?: string;
  /**
   * Tick the haptic engine each time the switch is flipped — a toggle you feel
   * click rather than one that merely slides. Needs the optional
   * `expo-haptics`, and is silent without it. Ignored in `native` mode, where
   * the platform control owns its own feedback.
   */
  haptics?: boolean;
}

/**
 * Animated switch. Thumb position and active-track opacity are driven on the
 * UI thread; toggling never re-renders beyond the value change itself.
 */
export const Switch = forwardRef<View, SwitchProps>(
  (
    {
      className,
      value,
      onValueChange,
      disabled,
      size = 'md',
      native,
      label,
      haptics,
      accessibilityLabel,
      accessibilityHint,
      accessibilityLabelledBy,
    },
    ref
  ) => {
    const progress = useSharedValue(value ? 1 : 0);
    // The track is mirrored by Yoga, but a transform is not — so "on" would
    // otherwise still be on the right in a right-to-left subtree, which reads
    // as the toggle running backwards.
    const sign = useDirectionSign();
    const nativeUI = native ? getNativeUI() : null;
    const slots = switchVariants({ size, disabled: !!disabled });
    // React Native's labelled-by relationship is Android-only. `label` or an
    // explicit accessibilityLabel remains the portable name on iOS.
    const fieldLabelledBy = useFieldLabelledBy();

    useEffect(() => {
      progress.value = withSpring(value ? 1 : 0, SPRING);
    }, [value, progress]);

    const thumbStyle = useAnimatedStyle(() => ({
      transform: [
        { translateX: interpolate(progress.value, [0, 1], [0, TRAVEL[size] * sign]) },
      ],
    }));

    const activeTrackStyle = useAnimatedStyle(() => ({
      opacity: progress.value,
    }));

    if (nativeUI) {
      const { Host, Switch: NativeSwitch } = nativeUI;
      return (
        // A platform toggle has a definite intrinsic size on both platforms,
        // so the host is left to follow it. Pinning the host to a number
        // instead is what leaves the control laid out against a box it never
        // agreed to, and settling into it a frame later.
        <Host matchContents ignoreSafeArea="keyboard">
          <NativeSwitch
            value={value}
            onValueChange={(next: boolean) => onValueChange?.(next)}
            label={label ?? accessibilityLabel}
            disabled={disabled}
          />
        </Host>
      );
    }

    return (
      <Pressable
        ref={ref}
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled: !!disabled }}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityLabelledBy={
          accessibilityLabelledBy ?? (accessibilityLabel || label ? undefined : fieldLabelledBy)
        }
        disabled={disabled}
        onPress={() => {
          if (haptics) selectionTick();
          onValueChange?.(!value);
        }}
        hitSlop={SWITCH_HIT_SLOP[size]}
      >
        <View className={slots.track({ className })}>
          <Animated.View style={activeTrackStyle} className={slots.activeTrack()} />
          <Animated.View style={thumbStyle} className={slots.thumb()} />
        </View>
      </Pressable>
    );
  }
);

Switch.displayName = 'Switch';
