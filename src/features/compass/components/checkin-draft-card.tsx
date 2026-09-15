import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { CompassCheckinDraft } from 'samwell-shared';

import { ThemedText } from '@/components/themed-text';
import { DraftCardShell } from '@/features/compass/components/draft-card-shell';
import { asColor } from '@/utils/colors';

type CheckinDraftCardProps = {
  draft: CompassCheckinDraft;
  /** Titles by trackable id, so an adjustment names the thing it changes. */
  titles: Record<string, string>;
  onApprove: () => void;
  onRefine: () => void;
  disabled?: boolean;
};

const ACTION_LABEL: Record<string, string> = {
  PAUSE: 'PAUSE',
  RESUME: 'RESUME',
  RETARGET: 'CHANGE THE TARGET',
  RETIRE: 'STOP TRACKING',
};

/**
 * What a check-in wants to change, for the reader to accept or argue with.
 *
 * A goal surviving contact with reality is the point of this card. Six a week
 * that has run at four for three weeks was Samwell's number, not the reader's
 * capacity, and the honest move is to change the number rather than to keep
 * scoring them against it.
 */
export function CheckinDraftCard({
  draft,
  titles,
  onApprove,
  onRefine,
  disabled,
}: CheckinDraftCardProps) {
  const mutedForeground = useCSSVariable('--color-muted-foreground');
  const muted = asColor(mutedForeground);

  const hasAdjustments = draft.adjustments.length > 0;

  return (
    <DraftCardShell
      label={hasAdjustments ? 'ADJUSTMENT' : 'WORTH REMEMBERING'}
      approveLabel={hasAdjustments ? 'MAKE THESE CHANGES' : 'KEEP THIS NOTE'}
      onApprove={onApprove}
      onRefine={onRefine}
      disabled={disabled}
    >
      {draft.adjustments.map((adjustment, i) => (
        // Index keys: a draft is a value, replaced wholesale on every revision.
        <View key={i} className="gap-1 border-l border-border pl-3">
          <ThemedText type="labelSm" color={muted}>
            {ACTION_LABEL[adjustment.action] ?? adjustment.action}
          </ThemedText>
          <ThemedText type="bodyMd">
            {titles[adjustment.trackableId] ?? 'This trackable'}
            {adjustment.action === 'RETARGET' && adjustment.target != null
              ? ` → ${adjustment.target}`
              : ''}
          </ThemedText>
          <ThemedText type="bodySm" color={muted}>
            {adjustment.reason}
          </ThemedText>
        </View>
      ))}

      {draft.journeyNote && (
        <ThemedText type="bodySm" color={muted} italic>
          {draft.journeyNote}
        </ThemedText>
      )}
    </DraftCardShell>
  );
}
