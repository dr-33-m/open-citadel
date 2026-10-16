import React from 'react';

import { ActionStrip } from '@/components/action-strip';
import type { LucideIcon } from '@/components/icons';
import { Popover, usePopoverAnchor, type PopoverAnchorRect } from '@/components/ui/popover';

export interface MessageAction {
  key: string;
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  /** Gold: the action that commits something. */
  primary?: boolean;
}

export interface MessageActionsProps {
  /** The held bubble, in window coordinates. Null when closed. */
  anchor: PopoverAnchorRect | null;
  actions: readonly MessageAction[];
  onClose: () => void;
}

/** Hands the held bubble to the popover as the thing it rises out of. */
function AnchorTo({ rect }: { rect: PopoverAnchorRect | null }) {
  const { anchorTo } = usePopoverAnchor('MessageActions');
  // Before paint: a reopened strip must not draw for a frame at the last
  // bubble it was held on.
  React.useLayoutEffect(() => {
    if (rect) anchorTo(rect);
  }, [rect, anchorTo]);
  return null;
}

/**
 * What can be done with a message the reader is holding: a slim strip of
 * actions that rises out of the bubble's top edge, the reader's selection
 * bar drawn at half its height (`ActionStrip slim`).
 *
 * Popover does the rest: it sits above the bubble at its end, flips below
 * when the bubble is near the top of the screen, and closes on a tap
 * anywhere else or on Back. Its entrance is the motion: a short rise from the
 * bubble with a settle, opacity only under Reduce Motion. One per
 * conversation, opened against whichever bubble was held.
 */
export function MessageActions({ anchor, actions, onClose }: MessageActionsProps) {
  const onOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open) onClose();
    },
    [onClose],
  );

  return (
    <Popover open={anchor !== null} onOpenChange={onOpenChange}>
      <AnchorTo rect={anchor} />
      <Popover.Content placement="top" align="end" offset={6} width="content-fit" unstyled className="rounded-none">
        <ActionStrip slim>
          {actions.map((action) => (
            <ActionStrip.Action
              key={action.key}
              icon={action.icon}
              label={action.label}
              primary={action.primary}
              onPress={action.onPress}
            />
          ))}
        </ActionStrip>
      </Popover.Content>
    </Popover>
  );
}
