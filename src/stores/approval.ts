import { create } from 'zustand';

export interface PendingApproval {
  sessionId: string;
  toolName: string;
  input: unknown;
}

type RespondOptions = {
  rememberForSession?: boolean;
};

interface PendingEntry {
  request: PendingApproval;
  resolver: (approved: boolean) => void;
}

type ApprovalState = {
  // Keyed by chat session id, not a single global slot — a tool call awaiting
  // approval in a session the user has since navigated away from must not be
  // clobbered by (or shown on top of) a different session's own approval.
  pendingBySession: Map<string, PendingEntry>;
  sessionAllowed: Set<string>;
  requestApproval: (request: PendingApproval) => Promise<boolean>;
  respond: (sessionId: string, approved: boolean, options?: RespondOptions) => void;
  /** Call when a (different) chat session becomes active — "for this
   * session" should mean the chat thread, not the whole app process. */
  resetSessionAllowed: () => void;
  /** Call when a session is deleted so any still-pending approval for it
   * resolves (denied) instead of leaking an unresolved promise. */
  clearSession: (sessionId: string) => void;
};

export const useApprovalStore = create<ApprovalState>((set, get) => ({
  pendingBySession: new Map(),
  sessionAllowed: new Set(),

  resetSessionAllowed: () => set({ sessionAllowed: new Set() }),

  requestApproval: (request: PendingApproval) => {
    if (get().sessionAllowed.has(request.toolName)) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      set((s) => {
        const next = new Map(s.pendingBySession);
        next.set(request.sessionId, { request, resolver: resolve });
        return { pendingBySession: next };
      });
    });
  },

  respond: (sessionId: string, approved: boolean, options?: RespondOptions) => {
    const entry = get().pendingBySession.get(sessionId);
    if (!entry) return;

    if (approved && options?.rememberForSession) {
      set((s) => ({ sessionAllowed: new Set(s.sessionAllowed).add(entry.request.toolName) }));
    }

    entry.resolver(approved);
    set((s) => {
      const next = new Map(s.pendingBySession);
      next.delete(sessionId);
      return { pendingBySession: next };
    });
  },

  clearSession: (sessionId: string) => {
    const entry = get().pendingBySession.get(sessionId);
    if (!entry) return;
    entry.resolver(false);
    set((s) => {
      const next = new Map(s.pendingBySession);
      next.delete(sessionId);
      return { pendingBySession: next };
    });
  },
}));
