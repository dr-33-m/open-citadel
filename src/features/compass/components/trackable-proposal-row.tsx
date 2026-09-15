import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { TrackableProposal } from 'samwell-shared';

import { ThemedText } from '@/components/themed-text';
import { measurementLabel } from '@/services/measurement';
import { scheduleSummary } from '@/services/occurrences';
import { asColor } from '@/utils/colors';

/**
 * One proposed trackable, inside a goal proposal.
 *
 * Deliberately three short lines. What the reader has to decide is whether
 * they can actually do this thing this often, and the schedule and the
 * measurement are the whole of that question — everything else is detail they
 * can read later in the planner.
 */
export function TrackableProposalRow({ trackable }: { trackable: TrackableProposal }) {
  const mutedForeground = useCSSVariable('--color-muted-foreground');
  const muted = asColor(mutedForeground);

  const measure = measurementLabel(trackable.measurement);
  const detail = [scheduleSummary(trackable.schedule), measure, trackable.timeOfDay]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="gap-1 border-l border-border pl-3">
      <ThemedText type="bodyMd">{trackable.title}</ThemedText>
      <ThemedText type="labelSm" color={muted}>
        {detail.toUpperCase()}
      </ThemedText>
    </View>
  );
}
