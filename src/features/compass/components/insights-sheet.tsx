import React from 'react';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { PageFade } from '@/components/scroll-fades';
import { Sheet } from '@/components/ui/sheet';
import { InsightsSkeleton } from '@/components/skeletons/compass-skeletons';
import { InsightsBody } from '@/features/compass/components/insights-body';
import type { LogView, TrackableView } from '@/services/occurrences';
import type { GoalConsistency, GoalRow } from '@/stores/compass';
import { asColor } from '@/utils/colors';

type InsightsSheetProps = {
  visible: boolean;
  onClose: () => void;
  goal: GoalRow | null;
  consistency: GoalConsistency | null;
  trackables: TrackableView[];
  logsByTrackable: Map<string, LogView[]>;
};

const SNAP_RATIOS = [0.62, 0.95];

/**
 * The goal, and what the record says about it.
 *
 * Just the chrome now — the record itself lives in `InsightsBody`, shared with
 * a goal's tab inside the multi-goal overview so the two surfaces can never
 * drift apart.
 */
export function InsightsSheet({
  visible,
  onClose,
  goal,
  consistency,
  trackables,
  logsByTrackable,
}: InsightsSheetProps) {
  const [primary] = useCSSVariable(['--color-primary']);

  return (
    // `contentPanning={false}`: the sheet's content drag is an ancestor
    // gesture and takes any pan inside it that is not a registered
    // `Sheet.ScrollView`, so the horizontal rows below rendered but never
    // moved. The registered vertical scroller still hands the sheet its drag,
    // and the grabber still drags it.
    <Sheet
      visible={visible}
      onClose={onClose}
      snapRatios={SNAP_RATIOS}
      scrollable
      contentPanning={false}
    >
      {/* Two SVG charts, a row of stat cards and a horizontal shelf: the
          heaviest commit in Compass. Landing it during the sheet's own rise
          competes with the animation for the UI thread, so the placeholder
          holds the frames and the mount happens once the sheet has settled. */}
      <Sheet.Deferred skeleton={<InsightsSkeleton />}>
      {/* Every scrollable in the app carries fades at its edges — with the
          scrollbars all hidden, the fade is the only thing saying content
          continues past the boundary. `popover` because a sheet sits on it:
          a gradient resolving to the wrong ground draws a visible band of
          the wrong shade instead of disappearing. */}
      <PageFade edges="both" surface="popover">
        <Sheet.ScrollView contentContainerClassName="gap-4 px-4 pb-6">
          <ThemedText type="labelSm" color={asColor(primary)}>
            INSIGHTS
          </ThemedText>

          <InsightsBody
            goal={goal}
            consistency={consistency}
            trackables={trackables}
            logsByTrackable={logsByTrackable}
          />
        </Sheet.ScrollView>
      </PageFade>
      </Sheet.Deferred>
    </Sheet>
  );
}
