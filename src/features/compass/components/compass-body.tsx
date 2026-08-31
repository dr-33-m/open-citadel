/**
 * What the Compass tab shows: the timeline, or the conversation over it.
 *
 * Closed (or peeked) it is the timeline — the goal, where it stands, what is
 * due. Open it is a check-in conversation, which ends in a draft card the
 * reader approves rather than in a message, because a check-in is something
 * you agree to, not something Samwell tells you.
 */
import React from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type {
  CompassMorningAnalysis,
  CompassNightAnalysis,
  CompassSetupProposal,
} from 'samwell-shared';

import { PageFade } from '@/components/scroll-fades';
import { ChatBubble } from '@/components/chat/chat-bubble';
import { MorningDraftCard, NightDraftCard, SetupDraftCard } from '@/components/compass/draft-cards';
import { formatCompassDate } from '@/components/compass/format';
import { SamwellCompassTimeline } from '@/components/samwell/samwell-compass-timeline';
import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { Spinner } from '@/components/ui/spinner';
import { Touchable } from '@/components/ui/touchable';
import type { CompassFlowState } from '@/features/compass/hooks/use-compass-flow';
import { asColor } from '@/utils/colors';

interface CompassBodyProps {
  compass: CompassFlowState;
  cloudReady: boolean;
  notConfigured: boolean;
  onOpenSettings: () => void;
  /** The shared centred column, so this matches the chat transcript. */
  contentColumn: ViewStyle;
  /** Keeps content clear of the floating input card. */
  floatingClearance: ViewStyle;
}

export function CompassBody({
  compass,
  cloudReady,
  notConfigured,
  onOpenSettings,
  contentColumn,
  floatingClearance,
}: CompassBodyProps) {
  const [primary, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);
  const scrollRef = React.useRef<ScrollView>(null);

  const { flow, opener, messages, draft, open, peek, submitting, committingProposal } = compass;

  if (!open || peek) {
    return (
      <SamwellCompassTimeline
        cloudReady={cloudReady}
        notConfigured={notConfigured}
        onOpenSettings={onOpenSettings}
        goal={compass.goal}
      />
    );
  }

  if (messages.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-2 px-4" style={floatingClearance}>
        <ThemedText type="bodySm" color={asColor(mutedForeground)}>
          Start chatting
        </ThemedText>
      </View>
    );
  }

  // Both edges, matching the chat transcript beside it: the check-in runs
  // under the header and under the floating input card.
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
        <ChatBubble role="assistant" content={opener} animateEntry />
        {messages.map((m, i) => (
          // Index keys: Compass turns have no ids — they are a transient
          // transcript in the session store, and the list only ever grows at
          // the end, so an index is stable for every row that already exists.
          <ChatBubble key={i} role={m.role} content={m.content} animateEntry />
        ))}

        {submitting === flow && (
          <View className="flex-row items-center gap-3 px-4 py-3">
            <Spinner size="sm" />
            <ThemedText type="labelMd" color={asColor(mutedForeground)}>
              GRAND MAESTER SAMWELL IS THINKING…
            </ThemedText>
          </View>
        )}

        {draft && !committingProposal && (
          <View className="px-1 py-2">
            <DraftCard compass={compass} />
          </View>
        )}

        {committingProposal && <CommitCard compass={compass} primary={asColor(primary)} />}
      </ScrollView>
    </PageFade>
  );
}

/** The flow's own draft card. Setup proposes a goal; the check-ins propose a
 *  reading of the day just described. */
function DraftCard({ compass }: { compass: CompassFlowState }) {
  const { flow, draft, approveDraft, finalizing } = compass;

  if (flow === 'setup') {
    return (
      <SetupDraftCard
        proposal={draft as CompassSetupProposal}
        onApprove={approveDraft}
        onRefine={() => {}}
      />
    );
  }
  if (flow === 'morning') {
    return (
      <MorningDraftCard
        analysis={draft as CompassMorningAnalysis}
        onApprove={approveDraft}
        onRefine={() => {}}
        disabled={finalizing}
      />
    );
  }
  return (
    <NightDraftCard
      analysis={draft as CompassNightAnalysis}
      onApprove={approveDraft}
      onRefine={() => {}}
      disabled={finalizing}
    />
  );
}

/** Where an approved setup lands: the goal is settled, the dates are not. */
function CommitCard({
  compass,
  primary,
}: {
  compass: CompassFlowState;
  primary: string | undefined;
}) {
  const { committingProposal, milestoneDate, goalDate, goal, finalizing, confirmSetup, setCalendarFor } =
    compass;
  if (!committingProposal) return null;

  return (
    <View className="px-1 py-2">
      <View className="gap-3 border-l-2 border-l-primary bg-card p-4">
        <ThemedText type="labelSm" color={primary}>
          COMMIT
        </ThemedText>
        <ThemedText type="headlineSm">{committingProposal.goalTitle}</ThemedText>
        <Touchable
          className="border border-border bg-muted p-3"
          onPress={() => setCalendarFor('milestone')}
        >
          <ThemedText type="bodyMd">
            {milestoneDate ? formatCompassDate(milestoneDate) : 'Pick milestone date'}
          </ThemedText>
        </Touchable>
        {!goal && (
          <Touchable
            className="border border-border bg-muted p-3"
            onPress={() => setCalendarFor('goal')}
          >
            <ThemedText type="bodyMd">
              {goalDate ? formatCompassDate(goalDate) : 'Pick goal target date'}
            </ThemedText>
          </Touchable>
        )}
        <GoldButton
          label={finalizing ? 'SETTING UP…' : 'CONFIRM GOAL'}
          onPress={finalizing ? undefined : () => void confirmSetup()}
        />
      </View>
    </View>
  );
}
