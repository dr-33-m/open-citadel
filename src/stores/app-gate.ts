import { create } from 'zustand';

import type { GateVerdict } from '@/features/updates/utils/update-gate';

type AppGateStore = {
  /** Why this copy can no longer be used, or null while it can. */
  update: GateVerdict | null;
  settle: (update: GateVerdict | null) => void;
};

/**
 * Whether this copy of the app is still served. Set by the server's answer to
 * the gate question, and by a 426 from any request, so a copy turned away
 * mid-session says why at once instead of failing at whatever it was doing.
 * Remembered across launches by `services/app-gate`.
 */
export const useAppGateStore = create<AppGateStore>((set) => ({
  update: null,
  settle: (update) => set((s) => (s.update === update ? s : { update })),
}));

/** A request turned away with 426: the update screen goes up now. */
export function reportUpdateRequired(update: GateVerdict | null): void {
  useAppGateStore.getState().settle(update ?? 'store');
}
