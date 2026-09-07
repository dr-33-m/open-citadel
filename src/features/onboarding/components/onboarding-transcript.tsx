import React from 'react';

import { ChatBubble } from '@/components/chat/chat-bubble';
import { TranscriptFade } from '@/components/scroll-fades';
import { MessageScroller } from '@/components/ui/message-scroller';
import { TurnStatus } from '@/features/chat/components/turn-status';
import type { TurnIndicator } from '@/features/chat/utils/agent-activity';
import { transcriptContent } from '@/features/chat/utils/transcript-layout';
import { isVisibleChatMessage } from '@/services/chat-transcript';
import type { ChatMessage } from '@/services/chat-sessions';

/**
 * The onboarding conversation on screen.
 *
 * Built from the same pieces the other two transcripts are — the scroller, the
 * bubble, the one live status row — rather than reusing `ChatTranscript`. That
 * component's props are shaped around reading chat: a readiness banner, an
 * empty state offering to wake the on-device engine, a book picker, three
 * navigation callbacks. None of it applies here, and threading a fourth mode
 * through it would make it worse for the two surfaces that do need those
 * things.
 *
 * The bubbles carry no navigation callbacks, and that is not an omission.
 * Samwell emits no reference markers in this conversation: he has never seen a
 * highlight of theirs, and until the last minute of it there are no books in
 * the library to link to. There is nowhere for a tap to go.
 */
export function OnboardingTranscript({
  sessionId,
  messages,
  streamingReply,
  indicator,
  lastStreamedMessageId,
}: {
  /** The scroller is keyed on it, so a resumed session opens where it was. */
  sessionId: string | null;
  messages: ChatMessage[];
  streamingReply: string;
  indicator: TurnIndicator | null;
  /** Already on screen as the streaming bubble, so it arrives without an
   *  entrance animation. */
  lastStreamedMessageId: string | null;
}) {
  /*
   * The setup notes are a system message, and system messages are not bubbles.
   *
   * They are persisted into the transcript so the conversation resumes with
   * everything Samwell needs after an app kill, which means they come straight
   * back out of `readMessages` alongside what was actually said. Without this
   * filter the reader's first sight of Open Citadel is a paragraph of
   * instructions written about them in the third person.
   *
   * Memoized because a streaming reply re-renders this component on every
   * token, and an unmemoized filter would hand the list a new array each time.
   */
  const turns = React.useMemo(() => messages.filter(isVisibleChatMessage), [messages]);

  return (
    <MessageScroller key={sessionId ?? 'onboarding'} autoScroll className="flex-1">
      {/* `start` only: unlike the hub's transcripts nothing floats over this
          one, so the bottom is an edge content stops at rather than passes
          behind. Same call `app/chat/[id]` makes for the same reason. */}
      <TranscriptFade edges="start">
        <MessageScroller.Viewport>
          <MessageScroller.Content style={transcriptContent}>
            {turns.map((message) => (
              <MessageScroller.Item
                key={message.id}
                messageId={message.id}
                // The reader's own turns are what a thread is navigated by.
                scrollAnchor={message.role === 'user'}
              >
                <ChatBubble
                  role={message.role as 'user' | 'assistant'}
                  content={message.content}
                  animateEntry={message.id !== lastStreamedMessageId}
                />
              </MessageScroller.Item>
            ))}

            {streamingReply.length > 0 && (
              <ChatBubble role="assistant" content={streamingReply} streaming />
            )}

            <TurnStatus indicator={indicator} />
          </MessageScroller.Content>
        </MessageScroller.Viewport>
      </TranscriptFade>
      <MessageScroller.Button />
    </MessageScroller>
  );
}
