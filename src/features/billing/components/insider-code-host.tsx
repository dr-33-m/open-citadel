import React from 'react';

import { InsiderCodeSheet } from '@/features/billing/components/insider-code-sheet';
import { useInsiderCode } from '@/features/billing/hooks/use-insider-code';

export type InsiderCodeHandle = { open: () => void };

/**
 * The insider code sheet holding its own state, opened through a ref.
 *
 * A container, nothing drawn of its own. It sits beside the cloud panel
 * rather than inside it for two reasons. The panel returns a different tree
 * for each state it can be in, and signing in halfway through this sheet
 * moves it from one to the next, which would unmount a sheet drawn in any of
 * them. And with the state in here, opening it and typing a code redraw this
 * and nothing around it.
 */
export function InsiderCodeHost({
  ref,
  onActivated,
}: {
  ref: React.Ref<InsiderCodeHandle>;
  /** A code has put a plan on the account. */
  onActivated?: () => void;
}) {
  const { open, sheet } = useInsiderCode({ onActivated });
  React.useImperativeHandle(ref, () => ({ open }), [open]);
  return <InsiderCodeSheet {...sheet} />;
}
