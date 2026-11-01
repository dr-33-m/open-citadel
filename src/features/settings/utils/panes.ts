/*
 * Settings is one screen: a short list, and a pane for each thing on it.
 * These are the rules for moving between them, kept apart from the screen so
 * they can be tested.
 */

/** In the order they are built ahead: the likeliest to be opened first. */
export const SETTINGS_PANES = ['samwell', 'voice', 'podcasts', 'profile', 'memory'] as const;

export type SettingsPane = (typeof SETTINGS_PANES)[number];

export const PANE_TITLES: Record<SettingsPane, string> = {
  profile: 'Profile',
  samwell: 'Samwell',
  voice: 'Reading voice',
  podcasts: 'Podcasts',
  memory: 'What Samwell knows',
};

export function isSettingsPane(value: unknown): value is SettingsPane {
  return typeof value === 'string' && (SETTINGS_PANES as readonly string[]).includes(value);
}

/**
 * Where "back" goes from `trail`, the panes opened so far (empty on the list):
 * one pane up, or null for out of Settings altogether.
 *
 * `enteredAt` is the pane Settings was opened straight onto, from somewhere
 * that wanted that pane (the chat's "set Samwell up"). Back from there returns
 * to where the reader came from, not to a list they never saw.
 */
export function stepBack(trail: readonly SettingsPane[], enteredAt: SettingsPane | null): SettingsPane[] | null {
  if (trail.length === 0) return null;
  if (trail.length === 1 && trail[0] === enteredAt) return null;
  return trail.slice(0, -1);
}

/** The panes to build ahead of being opened: the first `count`, in order. */
export function warmPanes(count: number): Record<SettingsPane, boolean> {
  const warm = {} as Record<SettingsPane, boolean>;
  SETTINGS_PANES.forEach((pane, index) => {
    warm[pane] = index < count;
  });
  return warm;
}
