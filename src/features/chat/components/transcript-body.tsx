import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { TranscriptFade } from '@/components/scroll-fades';
import { MessageScroller } from '@/components/ui/message-scroller';
import { EarlierTurns } from '@/features/chat/components/earlier-turns';
import { TranscriptSkeleton } from '@/features/chat/components/transcript-skeleton';
import { useTranscriptOpening } from '@/features/chat/hooks/use-transcript-opening';
import type { ChatMessage } from '@/services/chat-sessions';

type TranscriptBodyProps = {
  turns: readonly ChatMessage[];
  /** One turn's bubble; `animate` is false for what was already there when the chat opened. */
  renderTurn: (turn: ChatMessage, animate: boolean) => React.ReactNode;
  /** Everything drawn after the turns: an aside, the reply in flight, the status row. */
  tail: React.ReactNode;
  contentColumn: ViewStyle;
  contentStyle: StyleProp<ViewStyle>;
  floatingClearance: ViewStyle;
  keyboardOffset?: number;
};

/** Keep the first visible turn where it is when turns are added above it. */
const KEEP_PLACE = { minIndexForVisible: 0 } as const;
/** `MessageScroller.Content`'s own spacing, now on the scroll view's container. */
const COLUMN: ViewStyle = { gap: 12, padding: 16, paddingBottom: 64 };

/**
 * One conversation's scroller, mounted under a key per conversation by
 * `Transcript`, so each opens with its own state: at its end, out of sight
 * until it is there, over its skeleton, a page at a time (`useTranscriptOpening`).
 */
export function TranscriptBody({
  turns,
  renderTurn,
  tail,
  contentColumn,
  contentStyle,
  floatingClearance,
  keyboardOffset,
}: TranscriptBodyProps) {
  const { drawn, hasEarlier, loadEarlier, isHistory, onOpened, revealStyle, skeletonStyle, waiting } =
    useTranscriptOpening(turns);
  const containerStyle = React.useMemo(() => [COLUMN, contentStyle], [contentStyle]);

  return (
    // `preserveScrollOnPrepend` off: older pages are held in place natively
    // (`KEEP_PLACE`), in the frame they arrive, as Bluesky's chat holds them.
    // The scroller's own correction ran from JavaScript after the new layout,
    // and its measure could arrive before the rows had moved: the chat jumped
    // under the reader's finger as they scrolled up.
    <MessageScroller
      autoScroll
      preserveScrollOnPrepend={false}
      onOpened={onOpened}
      className="flex-1"
      style={contentColumn}
    >
      <EarlierTurns enabled={hasEarlier && !waiting} onReach={loadEarlier} />
      {/* Holds the place until the transcript is at its end, then fades as it arrives. */}
      {waiting ? (
        <Animated.View pointerEvents="none" className="absolute inset-0" style={skeletonStyle}>
          <TranscriptSkeleton floatingClearance={floatingClearance} />
        </Animated.View>
      ) : null}
      <Animated.View className="flex-1" style={revealStyle}>
        {/* Top and bottom: the transcript runs under the header and under the
            floating input card, so both edges are boundaries content passes
            behind rather than stops at. */}
        <TranscriptFade edges="both">
          {/* The turns are the scroll view's own children, not wrapped in
              `MessageScroller.Content`: the native position keeping below
              holds the first visible child still, and with one wrapper there
              is only one child, which never moves. */}
          <MessageScroller.Viewport
            keyboardOffset={keyboardOffset}
            contentContainerStyle={containerStyle}
            maintainVisibleContentPosition={KEEP_PLACE}
            accessibilityLiveRegion="polite"
          >
            {drawn.map((m) =>
              m.role === 'user' || m.role === 'assistant' ? (
                <MessageScroller.Item
                  key={m.id}
                  messageId={m.id}
                  // The reader's own turns are what a thread is navigated by:
                  // the question, not the tail of the answer to it.
                  scrollAnchor={m.role === 'user'}
                  // History, however low it lands, is never a message just sent.
                  arrived={!isHistory(m.id)}
                >
                  {renderTurn(m, !isHistory(m.id))}
                </MessageScroller.Item>
              ) : null,
            )}
            {tail}
          </MessageScroller.Viewport>
        </TranscriptFade>
      </Animated.View>

      {/* The button pins itself to the bottom of the scroller, which here is
          behind the floating input card. This lifts it clear of it: a
          `style` of its own would replace the animated one that fades it in,
          so the offset has to come from a box around it. */}
      <View pointerEvents="box-none" className="absolute inset-x-0 bottom-0 items-center" style={floatingClearance}>
        <MessageScroller.Button className="relative bottom-0" />
      </View>
    </MessageScroller>
  );
}
