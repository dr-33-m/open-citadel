import React from 'react';
import { View } from 'react-native';

import { Touchable } from '@/components/ui/touchable';
import { cn } from '@/lib/cn';

/**
 * The 40dp bordered box every icon control in a header sits in.
 *
 * A card, like the rest of the app's buttons: a surface a step off its ground
 * with the same soft weight under it. Four headers had each drawn their own
 * version of this — bare 36dp boxes with no surface at all, so the page showed
 * straight through them and they read as icons with a rectangle around them
 * rather than as things you press. They also disagreed with each other about
 * size and about colour.
 *
 * The size is fixed at 40dp on purpose. A header is a row of these with a
 * title between them, and the title only stays centred if both sides are the
 * same width whatever they contain, so this is not a prop.
 *
 * `hitSlop` takes the real target past the 44dp minimum without growing the
 * box, which is the size the design wants.
 */
const BOX = 'h-10 w-10 items-center justify-center border border-border bg-card';

export function IconButton({
  children,
  onPress,
  onLongPress,
  label,
  className,
  disabled,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  /** What it does, for screen readers — an icon alone says nothing. */
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  // Inert variants keep the surface but not the lift: a spacer that matches
  // the buttons beside it, where a shadow would promise a press.
  if (!onPress && !onLongPress) {
    return <View className={cn(BOX, className)}>{children}</View>;
  }

  return (
    <Touchable
      className={cn(BOX, 'shadow-sm', disabled && 'opacity-40', className)}
      hitSlop={8}
      haptic="select"
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={label}
    >
      {children}
    </Touchable>
  );
}

/** An empty 40dp box, so a title stays centred when one side has no control. */
export function IconButtonSpacer() {
  return <View className="h-10 w-10" />;
}
