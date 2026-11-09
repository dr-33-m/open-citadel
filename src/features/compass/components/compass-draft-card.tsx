import React from 'react';
import { View } from 'react-native';

import { CheckinDraftCard } from '@/features/compass/components/checkin-draft-card';
import { GoalProposalCard } from '@/features/compass/components/goal-proposal-card';
import type { CompassDraftProps } from '@/features/compass/hooks/use-compass-draft';

/**
 * The card a turn proposed, drawn in the transcript between the conversation
 * and Samwell's line introducing it: a new goal, or changes to the ones
 * running. Approving or refining it is Compass's own.
 */
export function CompassDraftCard({ draft, titles, approve, refine, committing }: CompassDraftProps) {
  const onApprove = React.useCallback(() => void approve(), [approve]);
  if (!draft) return null;
  return (
    <View className="px-1 py-2">
      {draft.kind === 'plan' ? (
        <GoalProposalCard proposal={draft.proposal} onApprove={onApprove} onRefine={refine} disabled={committing} />
      ) : (
        <CheckinDraftCard draft={draft.draft} titles={titles} onApprove={onApprove} onRefine={refine} disabled={committing} />
      )}
    </View>
  );
}
