import React from 'react';

import { SwitchPanes } from '@/components/switch-panes';
import { useSheetSettled } from '@/components/ui/sheet';
import { PlanSpendPane, type PlanSpendPaneProps } from '@/features/billing/components/plan-spend-pane';
import type { PlanSpend } from '@/features/billing/utils/plan-spend';

/** The sides, left to right as their tiles sit. */
const ORDER: readonly PlanSpend[] = ['brains', 'voices'];

export interface PlanSpendPanesProps {
  shown: PlanSpend;
  /** Each side's pane, or null for one the server did not send. */
  panes: Record<PlanSpend, PlanSpendPaneProps | null>;
}

/**
 * The brains and the voices of a plan, under their tiles, trading places the
 * way Lite and Enhanced do under their switch: a cross-fade with a short
 * step toward the tile just chosen, and no travel under Reduce Motion.
 *
 * The side not showing is built once the sheet has landed, not mid-rise and
 * not on the press that asks for it, so choosing it only reveals it.
 */
export function PlanSpendPanes({ shown, panes }: PlanSpendPanesProps) {
  const settled = useSheetSettled();

  return (
    <SwitchPanes
      order={ORDER}
      value={shown}
      warm={settled}
      panes={{
        brains: panes.brains ? <PlanSpendPane {...panes.brains} /> : null,
        voices: panes.voices ? <PlanSpendPane {...panes.voices} /> : null,
      }}
    />
  );
}
