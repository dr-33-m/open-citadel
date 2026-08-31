import { create } from 'zustand';
import type {
  CompassChatMessage,
  CompassMorningAnalysis,
  CompassNightAnalysis,
  CompassSetupProposal,
} from 'samwell-shared';

export type SamwellMode = 'chat' | 'compass';
export type CompassDraft =
  | CompassSetupProposal
  | CompassMorningAnalysis
  | CompassNightAnalysis
  | null;

type SamwellSessionStore = {
  /** Chat or Compass — the two things the one screen does. */
  mode: SamwellMode;
  /** Whether the Compass conversation is open over the Compass timeline. */
  compassOpen: boolean;
  /** Peeking at the timeline without closing the conversation behind it. */
  compassPeek: boolean;
  /** What is typed but not yet sent. */
  draft: string;
  /** The book a not-yet-created chat will be grounded in. */
  pendingBook: { id: string; title: string } | null;

  /** The Compass conversation in progress, and the proposal it has reached. */
  compassMessages: CompassChatMessage[];
  compassDraft: CompassDraft;
  /** An approved setup proposal, waiting on its dates before it is committed. */
  committingProposal: CompassSetupProposal | null;
  milestoneDate: string | null;
  goalDate: string | null;

  set: (patch: Partial<SamwellSessionStore>) => void;
  /** Everything a finished check-in or a fresh chat should clear. */
  resetCompass: () => void;
};

/**
 * The Samwell screen's own in-progress state, held outside the component.
 *
 * The screen used to be a tab, and a tab stays mounted whatever else the user
 * looks at. It is a pushed screen now, so leaving it — by the back button, by
 * the swipe, or by opening a book from a recommendation — unmounts it, and
 * anything held in `useState` there would go with it. Most of what the screen
 * shows already lives in a store (`useChatStore`, `useCompassStore`); this is
 * the rest, and it is the part that would hurt most to lose: a half-finished
 * check-in is a conversation the user has already had once.
 *
 * Deliberately not persisted to disk. This survives navigation, not a
 * relaunch — a stale morning check-in restored days later would be worse than
 * a fresh one.
 */
export const useSamwellSessionStore = create<SamwellSessionStore>((set) => ({
  mode: 'chat',
  compassOpen: false,
  compassPeek: false,
  draft: '',
  pendingBook: null,
  compassMessages: [],
  compassDraft: null,
  committingProposal: null,
  milestoneDate: null,
  goalDate: null,

  set: (patch) => set(patch),
  resetCompass: () =>
    set({
      compassMessages: [],
      compassDraft: null,
      committingProposal: null,
      milestoneDate: null,
      goalDate: null,
      compassOpen: false,
      compassPeek: false,
    }),
}));
