import type { Choice } from '@/components/choice-chips';
import { formatSpeed } from '@/features/podcasts/utils/format';
import type { NewEpisodesAction, ShowSwitch } from '@/db/schema';

export type { Choice };

/** The playback speeds offered anywhere a speed is chosen. */
export const SPEEDS = [0.8, 0.9, 1, 1.1, 1.2, 1.25, 1.3, 1.5, 1.75, 2, 2.5, 3];

const seconds = (s: number) => ({ value: s, label: `${s} sec` });

// App-wide (Settings).
export const SKIP_BACK: Choice<number>[] = [5, 10, 15, 30].map(seconds);
export const SKIP_FORWARD: Choice<number>[] = [10, 15, 30, 45, 60].map(seconds);
const DESTINATIONS: Choice<Exclude<NewEpisodesAction, 'global'>>[] = [
  { value: 'inbox', label: 'Just Arrived' },
  { value: 'queue', label: 'Up Next' },
  { value: 'nothing', label: 'Nowhere' },
];
export const NEW_EPISODES: Choice<Exclude<NewEpisodesAction, 'global'>>[] = DESTINATIONS;
export const REFRESH_INTERVALS: Choice<number>[] = [
  { value: 1, label: 'Hourly' },
  { value: 4, label: '4 hr' },
  { value: 12, label: '12 hr' },
  { value: 24, label: 'Daily' },
];

// One show's own (its settings sheet). "Default" follows the app-wide setting.
export const SHOW_SPEEDS: Choice<number | null>[] = [
  { value: null, label: 'Same as all shows' },
  ...SPEEDS.map((s) => ({ value: s, label: formatSpeed(s) })),
];
export const SHOW_SKIPS: Choice<number>[] = [0, 10, 15, 30, 45, 60, 90, 120, 180].map((s) => ({
  value: s,
  label: s === 0 ? 'Off' : s < 60 ? `${s} sec` : `${s / 60} min`,
}));
export const SHOW_NEW_EPISODES: Choice<NewEpisodesAction>[] = [{ value: 'global', label: 'Default' }, ...DESTINATIONS];
export const SHOW_SWITCHES: Choice<ShowSwitch>[] = [
  { value: 'global', label: 'Default' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

// The sleep timer.
export type SleepChoice = number | 'end' | 'off';

export const SLEEP_CHOICES: Choice<SleepChoice>[] = [
  { value: 'off', label: 'Off' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hr' },
  { value: 'end', label: 'End of episode' },
];

/** The same, for a book: its chapters are what end. */
export const BOOK_SLEEP_CHOICES: Choice<SleepChoice>[] = SLEEP_CHOICES.map((choice) =>
  choice.value === 'end' ? { value: 'end', label: 'End of chapter' } : choice,
);
