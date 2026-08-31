import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { CompassMorningAnalysis, CompassNightAnalysis, CompassSetupProposal } from 'samwell-shared';

import { scoreColor } from '@/components/compass/format';
import { MissionStep } from '@/components/compass/mission-step';
import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { Touchable } from '@/components/ui/touchable';
import { asColor } from '@/utils/colors';
import { computeFocusScore, orderMissionSteps } from '@/services/compass-math';

type ShellProps = {
  label: string;
  approveLabel: string;
  onApprove: () => void;
  onRefine: () => void;
  disabled?: boolean;
  children: React.ReactNode;
};

function DraftCardShell({ label, approveLabel, onApprove, onRefine, disabled, children }: ShellProps) {
  // Literal colours for consumers a className can't reach: ThemedText's
  // `color` prop.
  const [primary, mutedForeground] = useCSSVariable(['--color-primary', '--color-muted-foreground']);

  return (
    <View className="border-l-2 border-l-primary gap-3 bg-card p-4">
      <ThemedText type="labelSm" color={asColor(primary)}>
        {label}
      </ThemedText>
      <View className="gap-2">{children}</View>
      <View className="mt-1 gap-2">
        <GoldButton label={approveLabel} onPress={disabled ? undefined : onApprove} />
        <Touchable className="items-center border border-border py-3" onPress={disabled ? undefined : onRefine}>
          <ThemedText type="labelMd" color={asColor(mutedForeground)}>
            REFINE
          </ThemedText>
        </Touchable>
      </View>
    </View>
  );
}

export function SetupDraftCard({
  proposal,
  onApprove,
  onRefine,
  disabled,
}: {
  proposal: CompassSetupProposal;
  onApprove: () => void;
  onRefine: () => void;
  disabled?: boolean;
}) {
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);
  return (
    <DraftCardShell
      label="DRAFT · GOAL"
      approveLabel="APPROVE & SET DATES"
      onApprove={onApprove}
      onRefine={onRefine}
      disabled={disabled}
    >
      <ThemedText type="labelSm" color={asColor(mutedForeground)}>
        GOAL
      </ThemedText>
      <ThemedText type="headlineSm">{proposal.goalTitle}</ThemedText>
      <ThemedText type="bodySm" color={asColor(mutedForeground)}>
        {proposal.goalSummary}
      </ThemedText>

      {proposal.goalDurationDays != null && proposal.estimatedMilestones != null && (
        <ThemedText type="labelSm" color={asColor(mutedForeground)}>
          ~{proposal.goalDurationDays} DAYS · ~{proposal.estimatedMilestones} MILESTONES
        </ThemedText>
      )}

      <ThemedText type="labelSm" color={asColor(mutedForeground)} className="mt-2">
        FIRST MILESTONE
      </ThemedText>
      <ThemedText type="bodyMd">{proposal.milestoneTitle}</ThemedText>
      <ThemedText type="labelSm" color={asColor(mutedForeground)}>
        {proposal.estimatedEffortUnits} STEPS · ~{proposal.milestoneDurationDays} DAYS
      </ThemedText>
      <ThemedText type="labelSm" color={asColor(mutedForeground)}>
        {proposal.effortUnitDefinition}
      </ThemedText>
    </DraftCardShell>
  );
}

export function MorningDraftCard({
  analysis,
  onApprove,
  onRefine,
  disabled,
}: {
  analysis: CompassMorningAnalysis;
  onApprove: () => void;
  onRefine: () => void;
  disabled?: boolean;
}) {
  return (
    <DraftCardShell
      label="DRAFT · TODAY'S PLAN"
      approveLabel="LOG THE PLAN"
      onApprove={onApprove}
      onRefine={onRefine}
      disabled={disabled}
    >
      <ThemedText type="headlineSm">{analysis.headline}</ThemedText>
      {orderMissionSteps(analysis.mission).map((step, i) => (
        <MissionStep key={i} index={i + 1} step={step} />
      ))}
    </DraftCardShell>
  );
}

export function NightDraftCard({
  analysis,
  onApprove,
  onRefine,
  disabled,
}: {
  analysis: CompassNightAnalysis;
  onApprove: () => void;
  onRefine: () => void;
  disabled?: boolean;
}) {
  const [primary, mutedForeground] = useCSSVariable(['--color-primary', '--color-muted-foreground']);
  const focusScore = computeFocusScore(analysis.actions);
  const steps = Math.round(analysis.effortUnitsCompleted * 10) / 10;
  return (
    <DraftCardShell
      label="DRAFT · TONIGHT'S REVIEW"
      approveLabel="LOG THE REVIEW"
      onApprove={onApprove}
      onRefine={onRefine}
      disabled={disabled}
    >
      <ThemedText type="headlineSm">{analysis.headline}</ThemedText>
      <View className="flex-row items-baseline gap-3">
        <ThemedText type="displayMd" color={scoreColor(focusScore, asColor(primary) ?? '')}>
          {focusScore}%
        </ThemedText>
        <ThemedText type="labelSm" color={asColor(mutedForeground)}>
          FOCUS · +{steps} STEPS
        </ThemedText>
      </View>
    </DraftCardShell>
  );
}
