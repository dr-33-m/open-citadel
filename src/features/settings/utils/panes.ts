/*
 * Settings is a list, and a page for each thing on it. Each page is a route of
 * its own (`app/settings/[pane]`), pushed from the list and built when it is
 * opened, as Bluesky's settings screens and Expensify's settings pages are.
 */

/** Every page Settings has. */
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
 * Pages whose body scrolls itself (a list) rather than inside the page's own
 * scroll view.
 */
export function paneScrolls(pane: SettingsPane): boolean {
  return pane !== 'memory';
}
