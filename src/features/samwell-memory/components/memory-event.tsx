import React from 'react';

import { Ellipsis } from '@/components/icons';
import { Timeline } from '@/components/ui/timeline';
import { Touchable } from '@/components/ui/touchable';
import { fontFamily } from '@/constants/theme';
import type { MemoryEvent as MemoryEventData, MemoryNoteView } from '@/features/samwell-memory/utils/memory-rows';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type MemoryEventProps = MemoryEventData & {
  onOpen: (note: MemoryNoteView) => void;
};

/** The note's words are content, so they are in the serif, at reading size. */
const WORDS = { fontFamily: fontFamily.serif, fontSize: 16, lineHeight: 24 } as const;
/**
 * The chrome around them in the app's sans: the Timeline's text takes the
 * platform font unless told otherwise.
 */
const KIND = { fontFamily: fontFamily.sansSemiBold } as const;
const WHERE = { fontFamily: fontFamily.sans } as const;

/**
 * One thing he noted, as a stop on the timeline: a square marker toned by
 * kind, then the day and the chat it came from where they change, what kind of
 * note it is, and his words. The whole stop opens its sheet; nothing here
 * deletes on a single tap.
 *
 * No `Timeline.Aside`: its date column is a fixed 80 points beside the rail
 * on every stop, and most stops have no date of their own, so it was mostly a
 * margin. The rail sits at the edge of the column instead.
 *
 * Its own one-item `Timeline`, so each stop can be a row of the virtualized
 * list: a vertical item draws its own stretch of the rail, and consecutive
 * rows join into one line.
 */
export const MemoryEvent = React.memo(function MemoryEvent({
  note,
  label,
  tone,
  context,
  last,
  onOpen,
}: MemoryEventProps) {
  const tokens = useThemeTokens();
  // Nothing on this rail is progress, so no stop is "completed": the markers
  // are muted, and only a kind's tone colours one.
  return (
    <Touchable
      onPress={() => onOpen(note)}
      accessibilityRole="button"
      accessibilityHint="Correct it, open the chat it came from, or forget it"
    >
      <Timeline value={-1}>
        <Timeline.Item step={0} tone={tone} last={last}>
          <Timeline.Indicator className="rounded-none" />
          <Timeline.Content className="gap-1">
            {context ? <Timeline.Meta numberOfLines={1} style={WHERE}>{context}</Timeline.Meta> : null}
            <Timeline.Header>
              <Timeline.Label className="flex-1 tracking-wider" style={KIND}>
                {label}
              </Timeline.Label>
              <Ellipsis size={16} color={tokens['--color-muted-foreground']} />
            </Timeline.Header>
            <Timeline.Description className="text-foreground" style={WORDS}>
              {note.text}
            </Timeline.Description>
          </Timeline.Content>
        </Timeline.Item>
      </Timeline>
    </Touchable>
  );
});
