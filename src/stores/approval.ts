import { create } from 'zustand';

export interface PendingApproval {
  toolName: string;
  input: unknown;
}

type RespondOptions = {
  rememberForSession?: boolean;
};

type ApprovalState = {
  pending: PendingApproval | null;
  resolver: ((approved: boolean) => void) | null;
  sessionAllowed: Set<string>;
  requestApproval: (request: PendingApproval) => Promise<boolean>;
  respond: (approved: boolean, options?: RespondOptions) => void;
};

export const useApprovalStore = create<ApprovalState>((set, get) => ({
  pending: null,
  resolver: null,
  sessionAllowed: new Set(),

  requestApproval: (request: PendingApproval) => {
    if (get().sessionAllowed.has(request.toolName)) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      set({ pending: request, resolver: resolve });
    });
  },

  respond: (approved: boolean, options?: RespondOptions) => {
    const { resolver, pending, sessionAllowed } = get();
    const nextAllowed =
      approved && options?.rememberForSession && pending
        ? new Set(sessionAllowed).add(pending.toolName)
        : sessionAllowed;
    resolver?.(approved);
    set({ pending: null, resolver: null, sessionAllowed: nextAllowed });
  },
}));
