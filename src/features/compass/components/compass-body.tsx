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
import { Compass, LogIn, Settings, type LucideIcon } from '@/components/icons';
import { View, type ViewStyle } from 'react-native';

import { ChatBubble } from '@/components/chat/chat-bubble';
import { TranscriptFade } from '@/components/scroll-fades';
import { MessageScroller } from '@/components/ui/message-scroller';
import { TurnStatus } from '@/features/chat/components/turn-status';
import { SamwellStatusEmptyState } from '@/features/chat/components/samwell-status';
import { turnIndicator } from '@/features/chat/utils/agent-activity';
import { transcriptContent } from '@/features/chat/utils/transcript-layout';
import { CheckinDraftCard } from '@/features/compass/components/checkin-draft-card';
import { GoalProposalCard } from '@/features/compass/components/goal-proposal-card';
import type { CloudBlocker } from '@/features/chat/hooks/use-samwell-readiness';
import type { useCompassConversation } from '@/features/compass/hooks/use-compass-conversation';

type Conversation = ReturnType<typeof useCompassConversation>;

/**
 * What to say for each way the cloud can be out of reach, and the way out.
 *
 * A table rather than nested ternaries inside the render: there are three of
 * these now, and the next one is a line here instead of another branch in the
 * JSX.
 */
const COMPASS_BLOCKED: Record<
  Exclude<CloudBlocker, 'checkingAccount'>,
  { message: string; action: string; icon: LucideIcon }
> = {
  offlineMode: {
    message:
      'Tap the button below to switch Samwell to cloud mode and get started with your goals.',
    action: 'OPEN SETTINGS',
    icon: Settings,
  },
  notConfigured: {
    message: 'This build has no cloud server, so Samwell cannot help you plan a goal yet.',
    action: 'OPEN SETTINGS',
    icon: Settings,
  },
  needsAccount: {
    message: 'Sign in and let Samwell track and analyse your goals.',
    action: 'SIGN IN',
    icon: LogIn,
  },
};

interface CompassBodyProps {
  conversation: Conversation;
  /**
   * Compass is a cloud feature; without it there is nothing to talk to.
   *
   * One value rather than a pair of booleans, and it comes from
   * `useSamwellReadiness` — the same place the chat surface reads it from, so
   * the two halves of this screen can never disagree about why Samwell is
   * quiet. Null means there is nothing in the way.
   */
  cloudBlocker: CloudBlocker | null;
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
  cloudBlocker,
  onOpenSettings,
  trackableTitles,
  contentColumn,
  floatingClearance,
}: CompassBodyProps) {
  const {
    kind,
    activeSessionId,
    messages,
    draft,
    approve,
    refine,
    submitting,
    streamingReply,
    streamingThinking,
    streamingThinkingSeconds,
    lastStreamedMessageId,
    toolStatus,
    toolName,
    committing,
  } = conversation;

  /*
   * A reply arriving token by token changes this component's state dozens of
   * times a second, so anything the scroller is handed has to survive that.
   *
   * Following the text is `MessageScroller`'s job now, not this component's.
   * It used to be a `scrollToEnd` on every content-size change, which pinned
   * the reader to the bottom whether or not that is where they were.
   */
  const streaming = submitting && streamingReply.length > 0;
  /*
   * The reasoning is live only until the reply starts, and only when no tool
   * is in flight — a tool call hands the row over to the tool's own orb and
   * label, and the trace keeps growing behind the fold. Measured against the
   * server, thinking is nearly the whole turn: a plan turn thought for 3.8s
   * and then wrote its reply in 220ms.
   */
  const indicator = React.useMemo(
    () =>
      turnIndicator({
        isGenerating: submitting,
        isToolCalling: toolStatus !== null,
        toolCallName: toolName,
        toolCallStatus: toolStatus,
        isThinking: streamingThinking.length > 0,
        isStreaming: streaming,
        trace: streamingThinking,
        traceSeconds: streamingThinkingSeconds ?? undefined,
      }),
    [
      submitting,
      toolStatus,
      toolName,
      streamingThinking,
      streamingThinkingSeconds,
      streaming,
    ],
  );

  /* The same column the chat transcript uses, plus whatever the floating
     input card is covering. */
  const contentStyle = React.useMemo(
    () => [transcriptContent, floatingClearance],
    [floatingClearance],
  );

  /*
   * A proposal turn reads card first, then Samwell's line about it. The reply
   * lands in `messages` above the card, so hold it out of the list and render
   * it below the card instead — otherwise the card shoves the message off the
   * top of the view and you scroll up past a plan to read the sentence
   * introducing it.
   */
  const lastMessage = messages[messages.length - 1];
  const proposalReply =
    draft != null && lastMessage?.role === 'assistant' ? lastMessage : null;
  const listMessages = proposalReply ? messages.slice(0, -1) : messages;

  // Said before the empty prompt, not after: inviting someone to start typing
  // to something that cannot answer is worse than saying so up front.
  //
  // Drawn by the same component the chat surface uses, rather than a layout of
  // its own. It had a full-width `GoldButton` where chat has a small bordered
  // one, so the two halves of one screen disagreed about how big "the way out
  // of this" is — and there is no reason for the answer to differ by tab.
  // The stored session is still being read. Saying "sign in" here and taking
  // it back a frame later is worse than a beat of nothing, and this beat is
  // one local storage read long.
  if (cloudBlocker === 'checkingAccount') return null;

  if (cloudBlocker) {
    return (
      <SamwellStatusEmptyState
        icon={Compass}
        style={floatingClearance}
        status={{
          title:
            cloudBlocker === 'needsAccount'
              ? 'Compass works with your Cloud Account.'
              : 'Compass needs Samwell Cloud.',
          message: COMPASS_BLOCKED[cloudBlocker].message,
          // Nothing to offer when the build itself has no server: the way out
          // of that is a different build, not a screen in this one.
          actions:
            cloudBlocker === 'notConfigured'
              ? undefined
              : [
                  {
                    label: COMPASS_BLOCKED[cloudBlocker].action,
                    icon: COMPASS_BLOCKED[cloudBlocker].icon,
                    onPress: onOpenSettings,
                  },
                ],
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
    /* Keyed on the conversation: opening an earlier one should open it, not
       inherit where the last one was left. */
    <MessageScroller
      key={activeSessionId ?? 'new'}
      autoScroll
      className="flex-1"
      style={contentColumn}
    >
      <TranscriptFade edges="both">
        <MessageScroller.Viewport>
          <MessageScroller.Content style={contentStyle}>
            {/* Only what was actually said. A Compass transcript can carry a
                system row (the journey summary) and, once tools write to it,
                tool rows; neither is a turn anybody had. The proposal turn's
                own reply is held out here and rendered below its card. */}
            {listMessages.map((m) =>
              m.role === 'user' || m.role === 'assistant' ? (
                <MessageScroller.Item
                  key={m.id}
                  messageId={m.id}
                  scrollAnchor={m.role === 'user'}
                >
                  <ChatBubble
                    role={m.role}
                    content={m.content}
                    // The just-streamed reply is already on screen; animating
                    // its arrival is the flick the reader sees when a turn
                    // finishes.
                    animateEntry={m.id !== lastStreamedMessageId}
                  />
                </MessageScroller.Item>
              ) : null,
            )}

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

            {/* The turn's reply, below its card: streaming bubble while it
                arrives, the committed message once it lands. Without a draft
                on screen this falls through and the normal flow above has
                already drawn it. */}
            {submitting && streaming ? (
              <ChatBubble role="assistant" content={streamingReply} streaming />
            ) : proposalReply ? (
              <ChatBubble
                key={proposalReply.id}
                role="assistant"
                content={proposalReply.content}
                animateEntry={proposalReply.id !== lastStreamedMessageId}
              />
            ) : null}

            {/* One row for the whole turn: a plain status line on a model that
                does not reason, or the reasoning panel with tool work folded
                into its trigger. The panel is never unmounted mid-turn, so a
                tool call does not reset its "thought for how long" clock. */}
            <TurnStatus indicator={indicator} />
          </MessageScroller.Content>
        </MessageScroller.Viewport>
      </TranscriptFade>

      {/* Lifted clear of the floating input card the transcript runs under.
          See the same box in `ChatTranscript` for why it is a box and not a
          style on the button. */}
      <View
        pointerEvents="box-none"
        className="absolute inset-x-0 bottom-0 items-center"
        style={floatingClearance}
      >
        <MessageScroller.Button className="relative bottom-0" />
      </View>
    </MessageScroller>
  );
}
