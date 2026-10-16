/**
 * Reading chat's transcript: the shared `Transcript`, plus what only chat has.
 * A status banner over it (the model is asleep, the plan ran out), the empty
 * state in its place, and the reader's message drawn before the store has it
 * (on-device priming is a real wait).
 */
import React from "react";
import type { ViewStyle } from "react-native";

import {
    SamwellStatusBanner,
    SamwellStatusEmptyState,
} from "@/features/chat/components/samwell-status";
import { Transcript } from "@/features/chat/components/transcript";
import type { SamwellStatus } from "@/features/chat/hooks/use-samwell-status";
import type { TurnIndicator } from "@/features/chat/utils/agent-activity";
import type { ChatMessage } from "@/stores/chat";
import type { TurnActivity } from "@/utils/turn-activity";

interface ChatTranscriptProps {
  /** Which conversation this is. The scroller is keyed on it, so opening
   *  another one opens it rather than inheriting where the last one was left. */
  sessionId: string | null;
  messages: ChatMessage[];
  streamingContent: string;
  /** What the turn in flight has done so far, drawn above its reply as it happens. */
  streamingActivity: TurnActivity | null;
  /** True only while a reply is genuinely still owed. */
  isGenerating: boolean;
  /** The one live footer row: a status line, or the reasoning panel. */
  indicator: TurnIndicator | null;
  /** The assistant message that was just streamed in — it renders without the
   *  entrance animation, since it was already on screen as the streaming
   *  bubble. */
  lastStreamedMessageId: string | null;
  status: SamwellStatus | null;
  /** The user's message, held locally until the store has it — see below.
   *  Carries the id it will be committed under, so it can be drawn as the
   *  same element rather than one that gets replaced. */
  pendingUserMessage: { id: string; content: string } | null;
  contentColumn: ViewStyle;
  floatingClearance: ViewStyle;
  onNavigateToHighlight: (bookId: string, locator: string) => void;
  onNavigateToTimeline: () => void;
  onNavigateToBook: (bookId: string) => void;
  /** Sends again a message of the reader's that never got a reply. */
  onResendMessage: (id: string) => void;
}

export function ChatTranscript({
  sessionId,
  messages,
  streamingContent,
  streamingActivity,
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
  onResendMessage,
}: ChatTranscriptProps) {
  /*
   * The turns to draw: what the store has, plus the one it does not have yet.
   *
   * ONE array, and that is the whole point. The pending message used to be
   * rendered above this list as a loose child while the committed ones were
   * each wrapped in a `MessageScroller.Item`. React cannot reconcile a bare
   * child with an element in a different parent, so when the store caught up
   * one bubble unmounted and another mounted somewhere else — the blink that
   * read as two messages swapping. Suppressing its entrance animation hid half
   * of it; the reparent was the rest.
   *
   * Because the pending message already carries the id it will be committed
   * under (see `use-chat-sessions`), it lands here at the same position with
   * the same key. React updates that one element in place and there is nothing
   * to swap.
   *
   * It is appended only while the store has not got it. Once `sendMessage` has
   * run, `messages` holds the real row under the same id and the pending copy
   * would be a duplicate key.
   */
  const awaitingStore =
    pendingUserMessage != null &&
    !messages.some((m) => m.id === pendingUserMessage.id);

  const turns = React.useMemo(() => {
    if (pendingUserMessage == null || !awaitingStore) return messages;
    return [
      ...messages,
      {
        id: pendingUserMessage.id,
        sessionId: sessionId ?? "",
        role: "user" as const,
        content: pendingUserMessage.content,
        createdAt: new Date().toISOString(),
      },
    ];
  }, [messages, pendingUserMessage, awaitingStore, sessionId]);

  const isEmpty = turns.length === 0 && !streamingContent;
  // The reply in flight is drawn once it has words or has started doing
  // something: a search runs before a word of the answer exists.
  const live = streamingContent.length > 0 || (streamingActivity?.steps.length ?? 0) > 0;
  if (isEmpty) {
    return (
      <SamwellStatusEmptyState status={status} style={floatingClearance} />
    );
  }

  return (
    <>
      {status ? (
        <SamwellStatusBanner status={status} style={contentColumn} />
      ) : null}

      <Transcript
        sessionId={sessionId}
        turns={turns}
        live={live}
        streamingContent={streamingContent}
        streamingActivity={streamingActivity}
        isGenerating={isGenerating}
        indicator={indicator}
        pending={awaitingStore}
        lastStreamedMessageId={lastStreamedMessageId}
        contentColumn={contentColumn}
        floatingClearance={floatingClearance}
        onNavigateToHighlight={onNavigateToHighlight}
        onNavigateToTimeline={onNavigateToTimeline}
        onNavigateToBook={onNavigateToBook}
        onResendMessage={onResendMessage}
      />
    </>
  );
}
