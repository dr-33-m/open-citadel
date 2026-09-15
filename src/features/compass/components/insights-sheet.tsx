import React from 'react';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { PageFade } from '@/components/scroll-fades';
import { Sheet } from '@/components/ui/sheet';
import { InsightsSkeleton } from '@/components/skeletons/compass-skeletons';
import { GoalAbandonDialog } from '@/features/compass/components/goal-abandon-dialog';
import { GoalAwardDialog } from '@/features/compass/components/goal-award-dialog';
import { GoalDetailPanel } from '@/features/compass/components/goal-detail-panel';
import type { GoalConsistency, GoalRow } from '@/stores/compass';
import { asColor } from '@/utils/colors';

type InsightsSheetProps = {
  visible: boolean;
  onClose: () => void;
  goal: GoalRow | null;
  consistency: GoalConsistency | null;
  /** Close the goal out, or retire it early with the reader's reason. The same
   *  two the overview offers: a single-goal reader has to be able to end a goal
   *  too, and this is the only page they ever see it on. */
  onFinishGoal: (goalId: string) => Promise<void>;
  onAbandonGoal: (goalId: string, reason: string | null) => Promise<void>;
};

const SNAP_RATIOS = [0.62, 0.95];

/**
 * The goal, and what the record says about it.
 *
 * Just the chrome now — the body is `GoalDetailPanel`, the very same component
 * the multi-goal overview opens a goal into, so the two surfaces can never
 * drift apart. It reads its own trackables and logs from the goal's id, which
 * matters even here: the store's flat `trackables` is every active goal's now,
 * and passing it would draw one goal's heading over the whole set's heatmap.
 *
 * `onMakePrimary` is deliberately not passed. This sheet only opens when there
 * is a single goal, and there is no primary to be in a set of one.
 */
export function InsightsSheet({
  visible,
  onClose,
  goal,
  consistency,
  onFinishGoal,
  onAbandonGoal,
}: InsightsSheetProps) {
  const [primary] = useCSSVariable(['--color-primary']);

  /*
   * Ending the goal, in two acts — the same shape the overview uses.
   *
   * `awarded` holds the title rather than a boolean, because by the time the
   * dialog is up the goal has left the active set and `goal` is already null:
   * a dialog reading the title back out would congratulate you on nothing. The
   * reason itself is not here: `GoalAbandonDialog` owns its own field and
   * hands the text up on confirm.
   */
  const [awarded, setAwarded] = React.useState<string | null>(null);
  const [abandoning, setAbandoning] = React.useState<GoalRow | null>(null);

  // Plain handlers, not `useCallback`: nothing below is memoized on their
  // identity, and wrapping a function that reads a ref only gives the compiler
  // a memo it cannot preserve.
  const finish = () => {
    if (!goal) return;
    const title = goal.title;
    onClose();
    void onFinishGoal(goal.id).then(() => setAwarded(title));
  };

  const startAbandon = () => {
    if (!goal) return;
    setAbandoning(goal);
  };

  const confirmAbandon = (reason: string) => {
    const target = abandoning;
    if (!target) return;
    setAbandoning(null);
    onClose();
    void onAbandonGoal(target.id, reason || null);
  };

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

          {goal && (
            <GoalDetailPanel
              goal={goal}
              consistency={consistency}
              isPrimary={false}
              onFinish={finish}
              onAbandon={startAbandon}
            />
          )}
        </Sheet.ScrollView>
      </PageFade>
      </Sheet.Deferred>

      {/* Siblings of the sheet's body, drawn through a portal above it: a
          second modal would dismiss the sheet underneath, and these are
          questions asked ON BEHALF of what is still open behind them. */}
      <GoalAwardDialog title={awarded} onClose={() => setAwarded(null)} />
      {/* Keyed by the goal: a different goal is a different instance, so the
          reason field starts empty without anyone clearing it. */}
      <GoalAbandonDialog
        key={abandoning?.id ?? 'none'}
        title={abandoning?.title ?? null}
        onConfirm={confirmAbandon}
        onCancel={() => setAbandoning(null)}
      />
    </Sheet>
  );
}
