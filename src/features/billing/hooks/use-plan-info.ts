import React from 'react';
import type { CreditPlan, VoiceFigures } from 'samwell-shared';

import type { PlanFactModel } from '@/features/billing/utils/plan-facts';
import { planBrains, planVoices, type PlanSpend, type PlanSpendSide, type SpendFigure } from '@/features/billing/utils/plan-spend';

const LABELS: Record<PlanSpend, string> = { brains: 'BRAINS', voices: 'VOICES' };

export interface PlanInfoTile {
  key: PlanSpend;
  label: string;
  figure: SpendFigure;
}

/**
 * What a plan's info sheet shows, and the two things a reader can change in
 * it: which side of the Neurons they are looking at, and whose estimate each
 * side quotes.
 *
 * Each side keeps its own browsed choice, so looking at the voices and coming
 * back finds the brains where they were left. A choice the plan does not
 * offer falls back to the side's own default on its own: no reset, no effect.
 *
 * `opensOn` is the side whoever raised the sheet was asking about (the plans
 * under the Cloud reading voice open on the voices).
 */
export function usePlanInfo({
  plan,
  models,
  modelCount,
  voices,
  opensOn,
}: {
  plan: CreditPlan;
  models: readonly PlanFactModel[];
  modelCount: number;
  voices: VoiceFigures | null;
  opensOn: PlanSpend;
}) {
  const sides: Record<PlanSpend, PlanSpendSide | null> = {
    brains: planBrains(plan, models, modelCount),
    voices: planVoices(plan, voices),
  };
  const [chosen, setChosen] = React.useState(opensOn);
  const [browsed, setBrowsed] = React.useState<Record<PlanSpend, string | null>>({ brains: null, voices: null });

  const valueOf = (key: PlanSpend) => {
    const side = sides[key];
    const picked = browsed[key];
    return side && picked && side.figures[picked] ? picked : (side?.defaultValue ?? null);
  };
  const tileOf = (key: PlanSpend): PlanInfoTile | null => {
    const side = sides[key];
    const value = valueOf(key);
    return side ? { key, label: LABELS[key], figure: (value ? side.figures[value] : null) ?? side.fallback } : null;
  };

  /** What a side's pane takes, or null for a side this plan's server did not send. */
  const paneOf = (key: PlanSpend) => {
    const side = sides[key];
    return side
      ? { side, value: valueOf(key), onBrowse: (value: string) => setBrowsed((before) => ({ ...before, [key]: value })) }
      : null;
  };

  return {
    tiles: [tileOf('brains'), tileOf('voices')].filter((tile): tile is PlanInfoTile => tile !== null),
    // An older server sends no voices: the brains are then all there is.
    shown: (sides[chosen] ? chosen : 'brains') as PlanSpend,
    choose: setChosen,
    panes: { brains: paneOf('brains'), voices: paneOf('voices') },
  };
}
