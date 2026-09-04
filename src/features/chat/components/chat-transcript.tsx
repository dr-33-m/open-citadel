/**
 * The conversation itself.
 *
 * `MessageScroller.Viewport` rather than the virtualized `List`, which is a
 * deliberate difference from `chat/[id].tsx`: bubbles here play an entrance
 * animation, and an entrance on a recycled row fires again every time the row
 * is reused, so a scroll back up sets the whole transcript animating. Chats
 * are short enough that the virtualization is not worth losing that.
 *
 * What the scroller itself does — follow a reply down only while the reader is
 * already at the bottom, hand control back the moment they scroll away, hold
 * their place when content is added above — is the library's, and it replaced
 * a `scrollToEnd` on every content-size change that dragged the reader back to
 * the live edge whatever they were half way through reading.
 */
import React from 'react';
import { View, type ViewStyle } from 'react-native';

import { TranscriptFade } from '@/components/scroll-fades';
import { MessageScroller } from '@/components/ui/message-scroller';
import { ChatBubble } from '@/components/chat/chat-bubble';
import { AgentStatus } from '@/features/chat/components/agent-status';
import { TurnStatus } from '@/features/chat/components/turn-status';
import {
  SamwellStatusBanner,
  SamwellStatusEmptyState,
} from '@/features/chat/components/samwell-status';
import type { SamwellStatus } from '@/features/chat/hooks/use-samwell-status';
import { PENDING_ACTIVITY, type TurnIndicator } from '@/features/chat/utils/agent-activity';
import { transcriptContent } from '@/features/chat/utils/transcript-layout';
import type { ChatMessage } from '@/stores/chat';

interface ChatTranscriptProps {
  /** Which conversation this is. The scroller is keyed on it, so opening
   *  another one opens it rather than inheriting where the last one was left. */
  sessionId: string | null;
  messages: ChatMessage[];
  streamingContent: string;
  /** True only while a reply is genuinely still owed. */
  isGenerating: boolean;
  /** The one live footer row: a status line, or the reasoning panel. */
  indicator: TurnIndicator | null;
  /** The assistant message that was just streamed in — it renders without the
   *  entrance animation, since it was already on screen as the streaming
   *  bubble. */
  lastStreamedMessageId: string | null;
  status: SamwellStatus | null;
  /** The user's message, held locally until the store has it — see below. */
  pendingUserMessage: string | null;
  contentColumn: ViewStyle;
  floatingClearance: ViewStyle;
  onNavigateToHighlight: (bookId: string, locator: string) => void;
  onNavigateToTimeline: () => void;
  onNavigateToBook: (bookId: string) => void;
}

export function ChatTranscript({
  sessionId,
  messages,
  streamingContent,
  isGenerating,
  indicator,
  lastStreamedMessageId,
  status,
  pendingUserMessage,
  contentColumn,
  floatingClearance,
  onNavigateToHighlight,
  onNavigateToTimeline,
  onNavigateToBook,
}: ChatTranscriptProps) {
  /* The column, plus whatever the floating input card is covering. Merged
     here rather than by the caller, so the two hub transcripts pad
     identically. */
  const contentStyle = React.useMemo(
    () => [transcriptContent, floatingClearance],
    [floatingClearance],
  );

  const isEmpty = messages.length === 0 && !streamingContent && !pendingUserMessage;
  if (isEmpty) {
    return <SamwellStatusEmptyState status={status} style={floatingClearance} />;
  }

  // A brand-new session primes the engine with its system prompt before
  // `sendMessage` ever reaches the store, and on a slow device that priming
  // is a real wait. `pendingUserMessage` is what the reader sees in the
  // meantime, so their own message does not vanish for a second and a half.
  const showPending = pendingUserMessage != null && messages.length === 0;

  return (
    <>
      {status ? <SamwellStatusBanner status={status} style={contentColumn} /> : null}

      <MessageScroller
        key={sessionId ?? 'new'}
        autoScroll
        className="flex-1"
        style={contentColumn}
      >
        {/* Top and bottom: the transcript runs under the header and under the
            floating input card, so both edges are boundaries content passes
            behind rather than stops at. */}
        <TranscriptFade edges="both">
          <MessageScroller.Viewport>
            <MessageScroller.Content style={contentStyle}>
              {showPending && (
                <ChatBubble role="user" content={pendingUserMessage} animateEntry />
              )}

              {messages.map((m) => (
                <MessageScroller.Item
                  key={m.id}
                  messageId={m.id}
                  // The reader's own turns are what a thread is navigated by:
                  // the question, not the tail of the answer to it.
                  scrollAnchor={m.role === 'user'}
                >
                  <ChatBubble
                    role={m.role as 'user' | 'assistant'}
                    content={m.content}
                    // The just-streamed reply is already on screen; animating
                    // its "arrival" is the flick the reader sees when a turn
                    // finishes.
                    animateEntry={m.id !== lastStreamedMessageId}
                    onNavigateToHighlight={onNavigateToHighlight}
                    onNavigateToTimeline={onNavigateToTimeline}
                    onNavigateToBook={onNavigateToBook}
                  />
                </MessageScroller.Item>
              ))}

              {streamingContent.length > 0 && (
                <ChatBubble
                  role="assistant"
                  content={streamingContent}
                  streaming
                  // No entrance — it grows in token by token, and matching the
                  // committed bubble (which also does not animate) makes the
                  // hand-off pixel-identical.
                  onNavigateToHighlight={onNavigateToHighlight}
                  onNavigateToTimeline={onNavigateToTimeline}
                  onNavigateToBook={onNavigateToBook}
                />
              )}

              {showPending ? (
                // The store has nothing yet, so the indicator cannot know a
                // turn is under way. Same orb and same words it will show a
                // moment later, so the handover is invisible rather than a
                // spinner turning into an orb.
                <AgentStatus activity={PENDING_ACTIVITY} />
              ) : (
                // One row for the whole turn: a plain status line, or the
                // reasoning panel with tool work folded into its trigger.
                <TurnStatus indicator={indicator} />
              )}
            </MessageScroller.Content>
          </MessageScroller.Viewport>
        </TranscriptFade>

        {/* The button pins itself to the bottom of the scroller, which here is
            behind the floating input card. This lifts it clear of it — a
            `style` of its own would replace the animated one that fades it in,
            so the offset has to come from a box around it. */}
        <View
          pointerEvents="box-none"
          className="absolute inset-x-0 bottom-0 items-center"
          style={floatingClearance}
        >
          <MessageScroller.Button className="relative bottom-0" />
        </View>
      </MessageScroller>
    </>
  );
}
