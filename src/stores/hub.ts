import { create } from 'zustand';

/**
 * The hub's three pages, in the order they sit on screen.
 *
 * This order is the app's map, and it is the same one the header buttons and
 * the old transitions described: the Timeline is to the Library's left, and
 * Samwell is to its right. The Library is the middle because it is the thing
 * the app is for — both neighbours are one swipe from it, and neither is
 * two swipes from the other.
 */
export const HUB = { timeline: 0, library: 1, samwell: 2 } as const;

export type HubPage = (typeof HUB)[keyof typeof HUB];

type HubState = {
  /** The page currently on screen. */
  page: HubPage;
  /**
   * Ask the pager to move. Safe to call from anywhere, including a screen
   * stacked above the hub — the pager reads this on mount, so a request made
   * while the hub is covered is honoured when it comes back into view.
   */
  goTo: (page: HubPage) => void;
  /** Reported by the pager itself once a page settles. Not for callers. */
  settled: (page: HubPage) => void;
};

/**
 * Which of the hub's pages is showing.
 *
 * The pages are a pager rather than three routes, so moving between them is
 * not a navigation and `router.push('/timeline')` is not a thing that can
 * happen any more. This store is what replaces it: a screen stacked above the
 * hub (a chat, the reader) asks for a page here and then dismisses, and lands
 * on the page it asked for.
 *
 * Deliberately not a route param. A pager position is view state, not a
 * location — putting it in the URL would make every swipe a history entry,
 * and swiping between peers is not something the back button should undo.
 */
export const useHubStore = create<HubState>((set) => ({
  page: HUB.library,
  goTo: (page) => set({ page }),
  settled: (page) => set({ page }),
}));
