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
import { Compass } from 'lucide-react-native';
import { ScrollView, View, type ViewStyle } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ChatBubble } from '@/components/chat/chat-bubble';
import { PageFade } from '@/components/scroll-fades';
import { ThemedText } from '@/components/themed-text';
import { Spinner } from '@/components/ui/spinner';
import { SamwellStatusEmptyState } from '@/features/chat/components/samwell-status';
import { CheckinDraftCard } from '@/features/compass/components/checkin-draft-card';
import { GoalProposalCard } from '@/features/compass/components/goal-proposal-card';
import type { useCompassConversation } from '@/features/compass/hooks/use-compass-conversation';
import { asColor } from '@/utils/colors';

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
  const mutedForeground = useCSSVariable('--color-muted-foreground');
  const muted = asColor(mutedForeground);
  const scrollRef = React.useRef<ScrollView>(null);

  const { kind, messages, draft, approve, refine, submitting, committing } = conversation;

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

  if (messages.length === 0) {
    return (
      <View
        className="flex-1 items-center justify-center gap-2 px-8"
        style={floatingClearance}
      >
        <ThemedText type="headlineSm" className="text-center">
          {kind === 'plan' ? 'What do you want to work on?' : 'How is it going?'}
        </ThemedText>
        <ThemedText type="bodySm" color={muted} className="text-center">
          {kind === 'plan'
            ? 'Talk it through with Samwell. He will turn it into something you can actually track.'
            : 'Tell him where you are. He can see what you have logged and what you wrote about it.'}
        </ThemedText>
      </View>
    );
  }

  return (
    <PageFade edges="both">
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        style={contentColumn}
        contentContainerClassName="px-4 py-3 gap-1"
        contentContainerStyle={[floatingClearance]}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((m, i) => (
          // Index keys: these turns have no ids — they are a transient
          // transcript in the session store, and the list only ever grows at
          // the end, so an index is stable for every row that already exists.
          <ChatBubble key={i} role={m.role} content={m.content} animateEntry />
        ))}

        {submitting !== null && (
          <View className="flex-row items-center gap-3 px-4 py-3">
            <Spinner size="sm" />
            <ThemedText type="labelMd" color={muted}>
              SAMWELL IS THINKING…
            </ThemedText>
          </View>
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
      </ScrollView>
    </PageFade>
  );
}
