import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { GoalProposal } from 'samwell-shared';

import { ThemedText } from '@/components/themed-text';
import { DraftCardShell } from '@/features/compass/components/draft-card-shell';
import { TrackableProposalRow } from '@/features/compass/components/trackable-proposal-row';
import { asColor } from '@/utils/colors';

type GoalProposalCardProps = {
  proposal: GoalProposal;
  onApprove: () => void;
  onRefine: () => void;
  disabled?: boolean;
};

/**
 * The goal Samwell has arrived at, for the reader to approve or push back on.
 *
 * Presentational: it takes the proposal and two callbacks and reaches for
 * nothing. What it commits to is decided by the hook that owns it.
 */
export function GoalProposalCard({
  proposal,
  onApprove,
  onRefine,
  disabled,
}: GoalProposalCardProps) {
  const mutedForeground = useCSSVariable('--color-muted-foreground');
  const muted = asColor(mutedForeground);

  const weeks = Math.round(proposal.durationDays / 7);
  const span =
    proposal.durationDays >= 14
      ? `${weeks} WEEKS`
      : `${proposal.durationDays} ${proposal.durationDays === 1 ? 'DAY' : 'DAYS'}`;

  return (
    <DraftCardShell
      label="GOAL"
      approveLabel="START THIS GOAL"
      onApprove={onApprove}
      onRefine={onRefine}
      disabled={disabled}
    >
      <ThemedText type="headlineSm">{proposal.title}</ThemedText>
      <ThemedText type="bodySm" color={muted}>
        {proposal.summary}
      </ThemedText>

      <View className="flex-row flex-wrap items-center gap-x-3">
        <ThemedText type="labelSm" color={muted}>
          {span}
        </ThemedText>
        <ThemedText type="labelSm" color={muted}>
          {proposal.category}
        </ThemedText>
        {proposal.outcomeTarget != null && proposal.outcomeUnit != null && (
          <ThemedText type="labelSm" color={muted}>
            {`TARGET ${proposal.outcomeTarget} ${proposal.outcomeUnit}`}
          </ThemedText>
        )}
      </View>

      <View className="gap-3 pt-1">
        <ThemedText type="labelSm" color={muted}>
          {proposal.trackables.length === 1 ? 'WHAT YOU LOG' : `WHAT YOU LOG · ${proposal.trackables.length}`}
        </ThemedText>
        {proposal.trackables.map((trackable, i) => (
          // Index keys: a proposal is a value, not a persisted list. It is
          // replaced wholesale on every revision and never reordered in place.
          <TrackableProposalRow key={i} trackable={trackable} />
        ))}
      </View>

      {proposal.rationale && (
        <ThemedText type="bodySm" color={muted} italic>
          {proposal.rationale}
        </ThemedText>
      )}
    </DraftCardShell>
  );
}
