/**
 * The order the parts of the app take a new theme in.
 *
 * A theme change redraws every themed component, and the app keeps most of
 * itself mounted. Handed to everything at once that was one pass of two
 * seconds and more on a Galaxy A33. Handed to "the screen in view now, the
 * rest later" it was still one lump for the rest, and React starts a lump
 * again from the top whenever something more pressing arrives: leave Settings
 * a second after the switch and the Library sat in the old theme for another
 * two and a half.
 *
 * So the rest is handed out in steps, each small enough to finish in the gaps
 * between presses, in the order someone could next see them: what is under
 * the screen in view first, the things hidden behind a tab last. (Settings'
 * pages are screens of their own, built when opened, so none is waiting.)
 * `components/theme-scope` does the handing out; this says who is when.
 */
export const THEME_ORDER = {
  /** The screen the switch is on: with the press. */
  now: 0,
  /** What shows when that screen is left: the hub's page in view, and the app's frame. */
  next: 1,
  /** The hub's other pages, one step each, from here. */
  hubPages: 2,
  /** The Library's sides that are not showing, one step each, from here. */
  librarySides: 5,
  /** The last step there is. */
  last: 7,
} as const;

/**
 * The hub's pages in the order they are worth doing when not in view: the
 * Library (1) first, since it is a press away from either neighbour, then the
 * Timeline (0), then Samwell (2).
 */
const HUB_PAGE_RANK = [1, 0, 2];

/** A hub page (0 to 2): `next` when it is the one in view. */
export function hubPageOrder(page: number, current: number): number {
  return page === current ? THEME_ORDER.next : THEME_ORDER.hubPages + HUB_PAGE_RANK[page];
}

/** A side of the Library (0 to 2): with its page when showing, later when not. */
export function librarySideOrder(side: number, showing: boolean, pageOrder: number): number {
  return showing ? pageOrder : THEME_ORDER.librarySides + side;
}

/** Where a change has been handed out to, and which theme that was. */
export type Released<T extends string = string> = { theme: T; through: number };

/**
 * How far the theme now chosen has been handed out. A theme chosen since the
 * last hand-out began has only reached the part that takes it with the press.
 */
export function releasedThrough<T extends string>(released: Released<T>, chosen: T): number {
  return released.theme === chosen ? released.through : THEME_ORDER.now;
}

/** The next step to hand out, or null when every part has the theme. */
export function nextRelease<T extends string>(released: Released<T>, chosen: T): Released<T> | null {
  const through = releasedThrough(released, chosen);
  return through >= THEME_ORDER.last ? null : { theme: chosen, through: through + 1 };
}
