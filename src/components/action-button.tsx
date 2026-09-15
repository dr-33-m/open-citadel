import React from 'react';
import { View, type ViewStyle } from 'react-native';

import type { LucideIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { cn } from '@/lib/cn';

type ActionButtonProps = {
  /** The mark that says what this does. Every one of these carries one. */
  icon?: LucideIcon;
  /**
   * Something drawn in the icon's place — an animated glyph, a cover.
   *
   * The offline card's power button pulses while the model loads, and an
   * animation has to be composed by the caller rather than described by a prop.
   */
  leading?: React.ReactNode;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  /** Colours the icon and the label together, so they can never disagree. */
  tint?: string;
  /** A tinted surface, for the one button that warns rather than acts. */
  style?: ViewStyle;
  /**
   * Centre the icon and label instead of letting them sit at the leading edge.
   *
   * For a full-width button, where the content otherwise hugs the left and the
   * button reads as a mislaid row. It has to be a prop rather than a class the
   * caller passes, because the padding and the row both live on an inner view
   * that `className` cannot reach: `justify-center` on the Touchable centres
   * the inner view vertically and leaves the label exactly where it was.
   */
  centered?: boolean;
  className?: string;
  accessibilityLabel?: string;
};

/**
 * The small labelled button the settings panels are built from.
 *
 * TUNE, CHANGE, DOWNLOAD, WAKEN, DELETE — nine of these were written out
 * longhand across two files as `flex-row items-center gap-2 bg-muted px-3
 * py-2`, which is why they had drifted: the offline card's carried prefix
 * icons and the cloud card's did not, and none of them had the weight that
 * every other pressable surface in the app has.
 *
 * They are buttons, so they are built like the app's other buttons: a bordered
 * surface a step off whatever they sit on, with the soft shadow that says a
 * thing can be pressed. Flat and borderless, they read as labels.
 *
 * `muted` rather than `tile` for the surface, and that is not an oversight.
 * These sit INSIDE cards, and `tile` is the same value as `card` in the dark
 * theme — a tile button on a card would vanish. `muted` steps off the card in
 * both themes, which is the whole job here.
 */
export function ActionButton({
  icon: Icon,
  leading,
  label,
  onPress,
  disabled,
  tint,
  style,
  className,
  centered = false,
  accessibilityLabel,
}: ActionButtonProps) {
  return (
    <Touchable
      className={cn(
        // `shadow-sm` is PanelUI's card weight. The app's `elevation.soft` is
        // for book covers and timeline cards and reads as a hard drop at this
        // size — see the note in `screen-header`.
        'border border-border bg-muted shadow-sm',
        className,
      )}
      style={style}
      onPress={onPress}
      disabled={disabled}
      haptic="select"
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {/*
        The dim lives on an inner view, never on the Touchable.

        `AnimatedPressable` drives `opacity` from the UI thread for its press
        feedback and Reanimated writes animated props straight onto the native
        view, so a static opacity up there is overwritten every frame — this
        button carried a `disabled && 'opacity-50'` that had never once been
        visible. The padding moved in with it so the dim covers the whole
        surface rather than just the contents.
      */}
      <View
        className={cn(
          'flex-row items-center gap-2 px-3 py-2',
          centered && 'flex-1 justify-center',
        )}
        style={disabled ? { opacity: 0.5 } : undefined}
      >
        {leading ?? (Icon ? <Icon size={14} color={tint} /> : null)}
        <ThemedText type="labelSm" color={tint}>
          {label}
        </ThemedText>
      </View>
    </Touchable>
  );
}

/** A row of them, wrapping. The gap is the one every panel used. */
export function ActionButtonRow({ children }: { children: React.ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>;
}
