import React from 'react';

import { MessageSquarePlus } from '@/components/icons';
import { Touchable } from '@/components/ui/touchable';
import { iconSize } from '@/constants/theme';
import { cn } from '@/lib/cn';

/**
 * Starts a fresh conversation from the composer, one tap from anywhere in a
 * chat. The history sheet keeps its own New chat row; this is the short way.
 *
 * Squared and bordered like the mode switch and the toolbox handle beside it,
 * so the row reads as one set. Dimmed and inert with no `onPress`, which is
 * while a reply is still arriving: leaving then would cut it off.
 */
export function NewChatButton({
  label,
  color,
  onPress,
}: {
  label: string;
  color?: string;
  onPress?: () => void;
}) {
  return (
    <Touchable
      className={cn('h-10 w-10 items-center justify-center border border-border', !onPress && 'opacity-35')}
      onPress={onPress}
      disabled={!onPress}
      haptic="select"
      accessibilityLabel={label}
    >
      <MessageSquarePlus size={iconSize.default} color={color} strokeWidth={2} />
    </Touchable>
  );
}
