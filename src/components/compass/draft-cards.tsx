import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { CompassMorningAnalysis, CompassNightAnalysis, CompassSetupProposal } from 'samwell-shared';

import { scoreColor } from '@/components/compass/format';
import { MissionStep } from '@/components/compass/mission-step';
import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { Touchable } from '@/components/ui/touchable';
import { spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { computeFocusScore } from '@/services/compass-math';

type ShellProps = {
  label: string;
  approveLabel: string;
  onApprove: () => void;
  onRefine: () => void;
  disabled?: boolean;
  children: React.ReactNode;
};

function DraftCardShell({ label, approveLabel, onApprove, onRefine, disabled, children }: ShellProps) {
  const colors = useColors();
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.surface.low,
          borderLeftWidth: 2,
          borderLeftColor: colors.primary.default,
          padding: spacing[4],
          gap: spacing[3],
        },
        body: { gap: spacing[2] },
        actions: { gap: spacing[2], marginTop: spacing[1] },
        refine: {
          borderWidth: 1,
          borderColor: colors.outline.variant,
          paddingVertical: spacing[3],
          alignItems: 'center',
        },
      }),
    [colors],
  );

  return (
    <View style={styles.card}>
      <ThemedText type="labelSm" color={colors.primary.default}>
        {label}
      </ThemedText>
      <View style={styles.body}>{children}</View>
      <View style={styles.actions}>
        <GoldButton label={approveLabel} onPress={disabled ? undefined : onApprove} />
        <Touchable style={styles.refine} onPress={disabled ? undefined : onRefine}>
          <ThemedText type="labelMd" color={colors.text.secondary}>
            WORK ON IT MORE
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
  const colors = useColors();
  return (
    <DraftCardShell
      label="DRAFT · GOAL"
      approveLabel="APPROVE & PICK DATE"
      onApprove={onApprove}
      onRefine={onRefine}
      disabled={disabled}
    >
      <ThemedText type="labelSm" color={colors.text.secondary}>
        GOAL
      </ThemedText>
      <ThemedText type="headlineSm">{proposal.goalTitle}</ThemedText>
      <ThemedText type="bodySm" color={colors.text.secondary}>
        {proposal.goalSummary}
      </ThemedText>

      <ThemedText type="labelSm" color={colors.text.secondary} style={{ marginTop: spacing[2] }}>
        FIRST MILESTONE
      </ThemedText>
      <ThemedText type="bodyMd">{proposal.milestoneTitle}</ThemedText>
      <ThemedText type="labelSm" color={colors.text.secondary}>
        {proposal.estimatedEffortUnits} STEPS · {proposal.effortUnitDefinition}
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
      {analysis.mission.map((step, i) => (
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
  const colors = useColors();
  const focusScore = computeFocusScore(analysis.actions);
  const steps = Math.round(analysis.effortUnitsCompleted * 10) / 10;
  const styles = React.useMemo(
    () => StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'baseline', gap: spacing[3] } }),
    [],
  );
  return (
    <DraftCardShell
      label="DRAFT · TONIGHT'S REVIEW"
      approveLabel="LOG THE REVIEW"
      onApprove={onApprove}
      onRefine={onRefine}
      disabled={disabled}
    >
      <ThemedText type="headlineSm">{analysis.headline}</ThemedText>
      <View style={styles.row}>
        <ThemedText type="displayMd" color={scoreColor(focusScore, colors.primary.default)}>
          {focusScore}%
        </ThemedText>
        <ThemedText type="labelSm" color={colors.text.secondary}>
          FOCUS · +{steps} STEPS
        </ThemedText>
      </View>
    </DraftCardShell>
  );
}
