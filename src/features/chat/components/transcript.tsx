/**
 * A conversation with Samwell, drawn: the one transcript for chat (on the
 * device or in the cloud) and for Compass. What differs between them is the
 * engine and the tools, not the drawing, so they share this rather than each
 * keeping a copy that drifts (the two copies it replaces had already grown
 * different keys for the same scroller).
 *
 * `MessageScroller.Viewport` rather than the virtualized `List`: bubbles
 * here play an entrance animation, and an entrance on a recycled row fires
 * again every time the row is reused, so a scroll back up sets the whole
 * transcript animating. Chats are short enough that the virtualization is not
 * worth losing that.
 *
 * What the scroller itself does (follow a reply down only while the reader is
 * already at the bottom, hand control back the moment they scroll away, hold
 * their place when content is added above) is the library's, and it replaced
 * a `scrollToEnd` on every content-size change that dragged the reader back to
 * the live edge whatever they were half way through reading.
 *
 * It owns the conversation's sheets (sources, thought, tasks, privacy) and its
 * one strip of message actions, so each is wired once for every surface.
 */
import React from 'react';
import { View, type ViewStyle } from 'react-native';

import { ChatBubble } from '@/components/chat/chat-bubble';
import { MessageActions } from '@/components/chat/message-actions';
import { PrivacySheet } from '@/components/chat/privacy-sheet';
import { SourcesSheet } from '@/components/chat/sources-sheet';
import { TasksSheet } from '@/components/chat/tasks-sheet';
import { ThoughtSheet } from '@/components/chat/thought-sheet';
import { TranscriptFade } from '@/components/scroll-fades';
import { MessageScroller } from '@/components/ui/message-scroller';
import { AgentStatus } from '@/features/chat/components/agent-status';
import { TurnStatus } from '@/features/chat/components/turn-status';
import { useConversationKey } from '@/features/chat/hooks/use-conversation-key';
import { PENDING_ACTIVITY, type TurnIndicator } from '@/features/chat/utils/agent-activity';
import { transcriptContent } from '@/features/chat/utils/transcript-layout';
import { useMessageActions } from '@/hooks/use-message-actions';
import { useHeldSheet } from '@/hooks/use-held-sheet';
import type { ChatMessage } from '@/services/chat-sessions';
import type { TurnActivity, TurnStep, TurnThought } from '@/utils/turn-activity';
import type { WebSource } from 'samwell-shared';
import { unansweredMessageIds } from '@/utils/unanswered';
import type { PodcastCardKind } from '@/services/listening-tools/card';

export interface TranscriptProps {
  /** Which conversation this is: the scroller is keyed on it (`useConversationKey`). */
  sessionId: string | null;
  /** What was said, in order. Rows that are not turns (a system or tool row) are skipped. */
  turns: readonly ChatMessage[];
  /** The reply in flight, drawn once it has words or has started doing something. */
  live: boolean;
  streamingContent: string;
  /** What the turn in flight has done so far: the step it is on is drawn above its reply. */
  streamingActivity: TurnActivity | null;
  /** True only while a reply is genuinely still owed. */
  isGenerating: boolean;
  /** The one live footer row: a status line, or the reasoning panel. */
  indicator: TurnIndicator | null;
  /**
   * The reader's message is on screen but not yet in the store, so the
   * indicator cannot know a turn is under way. The footer shows the same orb
   * and words it will show a moment later, so the handover is invisible.
   */
  pending?: boolean;
  /** The reply that was just streamed in: it was already on screen, so it does not play an arrival. */
  lastStreamedMessageId: string | null;
  contentColumn: ViewStyle;
  floatingClearance: ViewStyle;
  /** Drawn after the turns and before the reply: Compass's proposal card. */
  aside?: React.ReactNode;
  /** A reply held out of `turns` to be drawn under `aside`, as Compass draws the line introducing its card. */
  trailingReply?: ChatMessage | null;
  onNavigateToHighlight?: (bookId: string, locator: string) => void;
  onNavigateToTimeline?: () => void;
  onNavigateToBook?: (bookId: string) => void;
  onNavigateToPodcast?: (kind: PodcastCardKind, id: string) => void;
  /** Sends again a message of the reader's that never got a reply. */
  onResendMessage?: (id: string) => void;
}

export function Transcript({
  sessionId,
  turns,
  live,
  streamingContent,
  streamingActivity,
  isGenerating,
  indicator,
  pending = false,
  lastStreamedMessageId,
  contentColumn,
  floatingClearance,
  aside,
  trailingReply,
  onNavigateToHighlight,
  onNavigateToTimeline,
  onNavigateToBook,
  onNavigateToPodcast,
  onResendMessage,
}: TranscriptProps) {
  const conversationKey = useConversationKey(sessionId);
  // The column, plus whatever the floating input card is covering.
  const contentStyle = React.useMemo(() => [transcriptContent, floatingClearance], [floatingClearance]);

  const sourcesSheet = useHeldSheet<readonly WebSource[]>(NO_SOURCES);
  const thoughtSheet = useHeldSheet<TurnThought | null>(null);
  const tasksSheet = useHeldSheet<readonly TurnStep[]>(NO_STEPS);
  const [privacyVisible, setPrivacyVisible] = React.useState(false);
  const openPrivacy = React.useCallback(() => setPrivacyVisible(true), []);
  const closePrivacy = React.useCallback(() => setPrivacyVisible(false), []);
  // The held-out reply still answers the message before it, and a message
  // still on its way to the store is being sent, not unanswered.
  const unanswered = React.useMemo(
    () => unansweredMessageIds(trailingReply ? [...turns, trailingReply] : turns, isGenerating || pending),
    [turns, trailingReply, isGenerating, pending],
  );
  const messageActions = useMessageActions({ unanswered, onResend: onResendMessage });

  const bubble = (m: ChatMessage) =>
    m.role === 'user' || m.role === 'assistant' ? (
      <ChatBubble
        role={m.role}
        content={m.content}
        activity={m.activity}
        // The just-streamed reply is already on screen; animating its
        // "arrival" is the flick the reader sees when a turn finishes.
        animateEntry={m.id !== lastStreamedMessageId}
        onNavigateToHighlight={onNavigateToHighlight}
        onNavigateToTimeline={onNavigateToTimeline}
        onNavigateToBook={onNavigateToBook}
        onNavigateToPodcast={onNavigateToPodcast}
        onOpenSources={sourcesSheet.open}
        onOpenThought={thoughtSheet.open}
        onOpenTasks={tasksSheet.open}
        // Only a reply that went through the cloud was covered by its promise.
        onOpenPrivacy={m.via === 'cloud' ? openPrivacy : undefined}
        messageId={m.id}
        onHold={messageActions.onHold}
      />
    ) : null;

  return (
    <>
      <MessageScroller key={conversationKey} autoScroll className="flex-1" style={contentColumn}>
        {/* Top and bottom: the transcript runs under the header and under the
            floating input card, so both edges are boundaries content passes
            behind rather than stops at. */}
        <TranscriptFade edges="both">
          <MessageScroller.Viewport>
            <MessageScroller.Content style={contentStyle}>
              {turns.map((m) =>
                m.role === 'user' || m.role === 'assistant' ? (
                  <MessageScroller.Item
                    key={m.id}
                    messageId={m.id}
                    // The reader's own turns are what a thread is navigated by:
                    // the question, not the tail of the answer to it.
                    scrollAnchor={m.role === 'user'}
                  >
                    {bubble(m)}
                  </MessageScroller.Item>
                ) : null,
              )}

              {aside}

              {/* No entrance on the reply in flight: it grows in token by
                  token, and matching the committed bubble (which also does not
                  animate) makes the hand-off pixel-identical. */}
              {live ? (
                <ChatBubble
                  role="assistant"
                  content={streamingContent}
                  activity={streamingActivity}
                  streaming
                  onNavigateToHighlight={onNavigateToHighlight}
                  onNavigateToTimeline={onNavigateToTimeline}
                  onNavigateToBook={onNavigateToBook}
                  onNavigateToPodcast={onNavigateToPodcast}
                />
              ) : trailingReply ? (
                <React.Fragment key={trailingReply.id}>{bubble(trailingReply)}</React.Fragment>
              ) : null}

              {/* One row for the whole turn: a plain status line, or the
                  reasoning panel with tool work folded into its trigger. The
                  panel is never unmounted mid-turn, so a tool call does not
                  reset its "thought for how long" clock. */}
              {pending ? <AgentStatus activity={PENDING_ACTIVITY} /> : <TurnStatus indicator={indicator} />}
            </MessageScroller.Content>
          </MessageScroller.Viewport>
        </TranscriptFade>

        {/* The button pins itself to the bottom of the scroller, which here is
            behind the floating input card. This lifts it clear of it: a
            `style` of its own would replace the animated one that fades it in,
            so the offset has to come from a box around it. */}
        <View pointerEvents="box-none" className="absolute inset-x-0 bottom-0 items-center" style={floatingClearance}>
          <MessageScroller.Button className="relative bottom-0" />
        </View>
      </MessageScroller>

      <SourcesSheet visible={sourcesSheet.visible} onClose={sourcesSheet.onClose} sources={sourcesSheet.value} />
      <PrivacySheet visible={privacyVisible} onClose={closePrivacy} />
      <TasksSheet visible={tasksSheet.visible} onClose={tasksSheet.onClose} steps={tasksSheet.value} />
      <ThoughtSheet visible={thoughtSheet.visible} onClose={thoughtSheet.onClose} thought={thoughtSheet.value} />
      <MessageActions {...messageActions.popover} />
    </>
  );
}

const NO_SOURCES: readonly WebSource[] = [];
const NO_STEPS: readonly TurnStep[] = [];
