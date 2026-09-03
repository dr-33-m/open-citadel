/**
 * The conversation itself.
 *
 * A plain `ScrollView` rather than a virtualized list, which is a deliberate
 * difference from `chat/[id].tsx`: bubbles here play an entrance animation,
 * and an entrance on a recycled row fires again every time the row is reused,
 * so a scroll back up sets the whole transcript animating. Chats are short
 * enough that the virtualization is not worth losing that.
 */
import React from 'react';
import { ScrollView, type ViewStyle } from 'react-native';

import { PageFade } from '@/components/scroll-fades';
import { ChatBubble } from '@/components/chat/chat-bubble';
import { AgentStatus } from '@/features/chat/components/agent-status';
import { TurnStatus } from '@/features/chat/components/turn-status';
import {
  SamwellStatusBanner,
  SamwellStatusEmptyState,
} from '@/features/chat/components/samwell-status';
import type { SamwellStatus } from '@/features/chat/hooks/use-samwell-status';
import { PENDING_ACTIVITY, type AgentActivity } from '@/features/chat/utils/agent-activity';
import type { ChatMessage } from '@/stores/chat';

interface ChatTranscriptProps {
  messages: ChatMessage[];
  streamingContent: string;
  thinkingContent: string;
  /** True while the reasoning trace itself is arriving. */
  isThinking: boolean;
  /** True only while a reply is genuinely still owed. */
  isGenerating: boolean;
  activity: AgentActivity | null;
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
  messages,
  streamingContent,
  thinkingContent,
  isThinking,
  isGenerating,
  activity,
  status,
  pendingUserMessage,
  contentColumn,
  floatingClearance,
  onNavigateToHighlight,
  onNavigateToTimeline,
  onNavigateToBook,
}: ChatTranscriptProps) {
  const scrollRef = React.useRef<ScrollView>(null);

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
      {/* Top and bottom: the transcript runs under the header and under
          the floating input card, so both edges are boundaries content
          passes behind rather than stops at. */}
      <PageFade edges="both">
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          style={contentColumn}
          contentContainerClassName="px-4 py-3 gap-1"
          contentContainerStyle={[floatingClearance]}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {showPending && <ChatBubble role="user" content={pendingUserMessage} animateEntry />}

          {messages.map((m) => (
            <ChatBubble
              key={m.id}
              role={m.role as 'user' | 'assistant'}
              content={m.content}
              animateEntry
              onNavigateToHighlight={onNavigateToHighlight}
              onNavigateToTimeline={onNavigateToTimeline}
              onNavigateToBook={onNavigateToBook}
            />
          ))}

          {streamingContent.length > 0 && (
            <ChatBubble
              role="assistant"
              content={streamingContent}
              streaming
              animateEntry
              onNavigateToHighlight={onNavigateToHighlight}
              onNavigateToTimeline={onNavigateToTimeline}
              onNavigateToBook={onNavigateToBook}
            />
          )}

          {showPending ? (
            // The store has nothing yet, so `activity` cannot know a turn is
            // under way. Same orb and same words it will show a moment later,
            // so the handover is invisible rather than a spinner turning into
            // an orb.
            <AgentStatus activity={PENDING_ACTIVITY} />
          ) : (
            // The one live row: orb, label and foldable trace in a single
            // piece that survives the whole turn. Thinking becomes tool work
            // becomes "Thought for 12s" without anything unmounting, and it
            // sits below the streaming bubble, which is where it rests once
            // the turn is over — so the handover moves nothing.
            <TurnStatus
              trace={thinkingContent}
              traceActive={isThinking && isGenerating}
              activity={activity}
            />
          )}
        </ScrollView>
      </PageFade>
    </>
  );
}
