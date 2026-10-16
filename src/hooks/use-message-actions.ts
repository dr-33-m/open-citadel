import React from 'react';

import type { MessageAction, MessageActionsProps } from '@/components/chat/message-actions';
import { Copy, RotateCcw } from '@/components/icons';
import type { PopoverAnchorRect } from '@/components/ui/popover';
import { copyText } from '@/lib/copy-text';

/** A message the reader has long-pressed, and where its bubble is on screen. */
export interface HeldMessage {
  id: string;
  content: string;
  rect: PopoverAnchorRect;
}

interface UseMessageActionsOptions {
  /** The reader's messages that never got a reply: the only ones worth sending again. */
  unanswered: ReadonlySet<string>;
  /** Sends a message again. Without it, nothing is offered but a copy. */
  onResend?: (id: string) => void;
}

const SAID = 'Message copied';

/**
 * What holding one of the reader's own messages does.
 *
 * Only a message that never got a reply has more than one thing to do with
 * it (send it again, or copy it), so only that one raises the strip of
 * actions (`MessageActions`). Holding any other just copies it and says so in
 * a toast: a menu with one item in it is a tap spent for nothing.
 *
 * One per conversation; `onHold` is stable, so holding does not re-render the
 * transcript's bubbles.
 */
export function useMessageActions({ unanswered, onResend }: UseMessageActionsOptions): {
  onHold: (message: HeldMessage) => void;
  popover: MessageActionsProps;
} {
  // The held message stays after the strip closes, so it leaves with its
  // actions still in it rather than shrinking to nothing on the way out.
  const [held, setHeld] = React.useState<{ message: HeldMessage; open: boolean } | null>(null);
  // Read when a bubble is held rather than closed over, so a turn finishing
  // does not hand every bubble a new callback.
  const latest = React.useRef({ unanswered, onResend });
  React.useLayoutEffect(() => {
    latest.current = { unanswered, onResend };
  });

  const onHold = React.useCallback((message: HeldMessage) => {
    const { unanswered: failed, onResend: resend } = latest.current;
    if (resend && failed.has(message.id)) setHeld({ message, open: true });
    else copyText(message.content, SAID);
  }, []);

  const onClose = React.useCallback(() => setHeld((shown) => (shown ? { ...shown, open: false } : shown)), []);

  const message = held?.message ?? null;
  const actions = React.useMemo((): MessageAction[] => {
    if (!message) return [];
    return [
      {
        key: 'resend',
        icon: RotateCcw,
        label: 'Resend',
        primary: true,
        onPress: () => {
          onClose();
          latest.current.onResend?.(message.id);
        },
      },
      {
        key: 'copy',
        icon: Copy,
        label: 'Copy',
        onPress: () => {
          onClose();
          copyText(message.content, SAID);
        },
      },
    ];
  }, [message, onClose]);

  const anchor = held?.open ? held.message.rect : null;
  const popover = React.useMemo(() => ({ anchor, actions, onClose }), [anchor, actions, onClose]);
  return { onHold, popover };
}
