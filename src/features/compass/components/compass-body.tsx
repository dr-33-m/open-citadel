/**
 * What Compass shows: a conversation, and whatever it has proposed.
 *
 * You land on an empty chat. There is no dashboard to read first and no clock
 * deciding what kind of conversation you are allowed to have — the reason
 * someone opens this is usually that they are stuck right now, and the useful
 * response to that is a cursor, not a chart. The numbers live behind INSIGHTS
 * and the month behind PLANNER, for when they are what you actually came for.
 */
import React from 'react';
import { Compass } from '@/components/icons';
import { ScrollView, View, type ViewStyle } from 'react-native';

import { ChatBubble } from '@/components/chat/chat-bubble';
import { PageFade } from '@/components/scroll-fades';
import { SamwellStatusEmptyState } from '@/features/chat/components/samwell-status';
import { TurnStatus } from '@/features/chat/components/turn-status';
import { agentActivity } from '@/features/chat/utils/agent-activity';
import { CheckinDraftCard } from '@/features/compass/components/checkin-draft-card';
import { GoalProposalCard } from '@/features/compass/components/goal-proposal-card';
import type { useCompassConversation } from '@/features/compass/hooks/use-compass-conversation';

type Conversation = ReturnType<typeof useCompassConversation>;

interface CompassBodyProps {
  conversation: Conversation;
  /** Compass is a cloud feature; without it there is nothing to talk to. */
  cloudReady: boolean;
  notConfigured: boolean;
  onOpenSettings: () => void;
  /** Titles by trackable id, so an adjustment can name what it changes. */
  trackableTitles: Record<string, string>;
  /** The shared centred column, so this matches the chat transcript. */
  contentColumn: ViewStyle;
  /** Keeps content clear of the floating input card. */
  floatingClearance: ViewStyle;
}

export function CompassBody({
  conversation,
  cloudReady,
  notConfigured,
  onOpenSettings,
  trackableTitles,
  contentColumn,
  floatingClearance,
}: CompassBodyProps) {
  const scrollRef = React.useRef<ScrollView>(null);

  const {
    kind,
    messages,
    draft,
    approve,
    refine,
    submitting,
    streamingReply,
    streamingThinking,
    toolStatus,
    toolName,
    committing,
  } = conversation;

  /*
   * A reply arriving token by token changes this component's state dozens of
   * times a second, so anything the ScrollView is handed has to survive that.
   *
   * `streaming` also decides how the transcript follows the text. An animated
   * `scrollToEnd` per token queues a new scroll animation before the last one
   * has finished, dozens deep; jumping is what a transcript that is being
   * written under you should do anyway, and the animation is for the one case
   * it reads as motion: a message the reader just sent.
   */
  const streaming = submitting && streamingReply.length > 0;
  /*
   * The reasoning is live only until the reply starts, and only when no tool
   * is in flight — a tool call hands the row over to the tool's own orb and
   * label, and the trace keeps growing behind the fold. Measured against the
   * server, thinking is nearly the whole turn: a plan turn thought for 3.8s
   * and then wrote its reply in 220ms.
   */
  const thinking =
    submitting && !streaming && toolStatus === null && streamingThinking.length > 0;
  /*
   * The same function the reading surface uses, now that Compass genuinely
   * calls tools. It used to be a two-entry lookup, which was honest while a
   * Compass turn was one structured answer and became a lie the moment
   * Samwell could search the library or write a log mid-turn.
   */
  const activity = React.useMemo(
    () =>
      agentActivity({
        isGenerating: submitting,
        isToolCalling: toolStatus !== null,
        toolCallName: toolName,
        toolCallStatus: toolStatus,
        isThinking: streamingThinking.length > 0,
        isStreaming: streaming,
      }),
    [submitting, toolStatus, toolName, streamingThinking.length, streaming],
  );

  const followContent = React.useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: !streaming });
  }, [streaming]);
  const scrollContentStyle = React.useMemo(() => [floatingClearance], [floatingClearance]);

  // Said before the empty prompt, not after: inviting someone to start typing
  // to something that cannot answer is worse than saying so up front.
  //
  // Drawn by the same component the chat surface uses, rather than a layout of
  // its own. It had a full-width `GoldButton` where chat has a small bordered
  // one, so the two halves of one screen disagreed about how big "the way out
  // of this" is — and there is no reason for the answer to differ by tab.
  if (!cloudReady) {
    return (
      <SamwellStatusEmptyState
        icon={Compass}
        style={floatingClearance}
        status={{
          title: 'Compass needs Samwell Cloud.',
          message: notConfigured
            ? 'This build has no cloud server, so Samwell cannot help you plan a goal yet.'
            : 'Tap button below to switch Samwell to cloud mode and get started with your goals.',
          actions: notConfigured
            ? undefined
            : [{ label: 'OPEN SETTINGS', onPress: onOpenSettings }],
        }}
      />
    );
  }

  // The same component again, so an empty Compass and an empty chat are one
  // shape with different words in it. Hand-rolling the title and the paragraph
  // here is what left this surface without the icon the other one had.
  if (messages.length === 0) {
    return (
      <SamwellStatusEmptyState
        icon={Compass}
        style={floatingClearance}
        status={{
          title: kind === 'plan' ? 'What do you want to work on?' : 'How is it going?',
          message:
            kind === 'plan'
              ? 'Talk it through with Samwell. He will turn it into something you can actually track.'
              : 'Tell him where you are. He can see what you have logged and what you wrote about it.',
        }}
      />
    );
  }

  return (
    <PageFade edges="both">
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        style={contentColumn}
        contentContainerClassName="px-4 py-3 gap-1"
        contentContainerStyle={scrollContentStyle}
        onContentSizeChange={followContent}
      >
        {/* Only what was actually said. A Compass transcript can carry a
            system row (the journey summary) and, once tools write to it, tool
            rows; neither is a turn anybody had. */}
        {messages.map((m) =>
          m.role === 'user' || m.role === 'assistant' ? (
            <ChatBubble key={m.id} role={m.role} content={m.content} animateEntry />
          ) : null,
        )}

        {/* Once the reply starts arriving the bubble is the status, exactly as
            in chat: two things claiming to report the same wait is how the
            other surface ended up with a pill under a half-written answer.
            The trace row sits below the bubble, where it rests once the turn
            is over, so the handover from thinking to writing is a fold. */}
        {submitting && streaming ? (
          <ChatBubble role="assistant" content={streamingReply} streaming />
        ) : null}

        {/* One row for the whole turn: orb, label and foldable trace. A tool
            call mid-turn changes the orb's shape and the label's words instead
            of swapping rows, which is the interleave the two-row version kept
            getting wrong. */}
        <TurnStatus
          trace={streamingThinking}
          traceActive={thinking}
          activity={activity}
        />

        {draft?.kind === 'plan' && (
          <View className="px-1 py-2">
            <GoalProposalCard
              proposal={draft.proposal}
              onApprove={() => void approve()}
              onRefine={refine}
              disabled={committing}
            />
          </View>
        )}

        {draft?.kind === 'checkin' && (
          <View className="px-1 py-2">
            <CheckinDraftCard
              draft={draft.draft}
              titles={trackableTitles}
              onApprove={() => void approve()}
              onRefine={refine}
              disabled={committing}
            />
          </View>
        )}
      </ScrollView>
    </PageFade>
  );
}
