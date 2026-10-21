import React from 'react';

import { Touchable } from '@/components/ui/touchable';
import { fontFamily } from '@/constants/theme';

/** A value drawn as a tool ("1.5×", a timer, a count): figures that line up as they change. */
export const TOOL_VALUE = { fontFamily: fontFamily.sansSemiBold, fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums' as const] };

type PlayerToolProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
};

/**
 * One of the player's quiet tools under the transport: an icon (or a value,
 * "1.5×") with no box round it, on a full 44pt target. The transport is the
 * only thing on the screen drawn as buttons; these sit back so it reads first.
 */
export function PlayerTool({ label, onPress, disabled = false, children }: PlayerToolProps) {
  return (
    <Touchable
      className="h-11 min-w-11 flex-row items-center justify-center gap-1.5"
      style={disabled ? { opacity: 0.4 } : undefined}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      haptic="select"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      {children}
    </Touchable>
  );
}
