import { create } from 'zustand';
import type { CompassChatMessage, CompassCheckinDraft, GoalProposal } from 'samwell-shared';

export type SamwellMode = 'chat' | 'compass';

/** What the current Compass conversation has proposed, if anything. */
export type CompassDraft =
  | { kind: 'plan'; proposal: GoalProposal }
  | { kind: 'checkin'; draft: CompassCheckinDraft }
  | null;

type SamwellSessionStore = {
  /** Chat or Compass — the two things the one screen does. */
  mode: SamwellMode;
  /** What is typed but not yet sent. */
  draft: string;
  /** The book a not-yet-created chat will be grounded in. */
  pendingBook: { id: string; title: string } | null;

  /** The Compass conversation in progress, and the proposal it has reached. */
  compassMessages: CompassChatMessage[];
  compassDraft: CompassDraft;
  /**
   * The user asked to work on the draft some more.
   *
   * This does NOT dismiss the card — that is the whole reason the old REFINE
   * button never worked. It stays on screen while they type their objection,
   * so they can see what they are arguing with. The next send clears it.
   */
  refining: boolean;

  /**
   * Cards swiped past with "not now", for this session only.
   *
   * Deliberately not a row. "Not now" is not data: the user did not tell us
   * anything happened, only that they did not want to answer yet, and writing
   * that down would put it in the consistency maths where it does not belong.
   * It comes back tomorrow, and it comes back if they reopen the deck after a
   * relaunch, which is the honest behaviour.
   */
  skippedTrackableIds: string[];

  set: (patch: Partial<SamwellSessionStore>) => void;
  /** Everything a finished conversation or a fresh one should clear. */
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
 * conversation is one the user has already had once.
 *
 * Deliberately not persisted to disk. This survives navigation, not a
 * relaunch.
 */
export const useSamwellSessionStore = create<SamwellSessionStore>((set) => ({
  mode: 'chat',
  draft: '',
  pendingBook: null,
  compassMessages: [],
  compassDraft: null,
  refining: false,
  skippedTrackableIds: [],

  set: (patch) => set(patch),
  resetCompass: () =>
    set({
      compassMessages: [],
      compassDraft: null,
      refining: false,
      skippedTrackableIds: [],
    }),
}));
