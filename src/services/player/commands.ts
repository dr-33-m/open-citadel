/**
 * What the lock screen, the notification and a headset may do, for what is
 * in the player now.
 *
 * An episode is one long item, so the native player does it all on its own,
 * with the listener's skip lengths. A book is a queue of sentences, a few
 * seconds each, so a skip or a drag of the bar has to cross items: those go
 * to JS (`handling: 'hybrid'`), which knows the book's clock
 * (`services/audiobook`). Play and pause stay native, so they answer at once
 * even when the app is asleep.
 */
import TrackPlayer, { PlayerCommand } from '@rntp/player';

import { podcastPrefs, usePodcastPrefs } from '@/stores/podcast-prefs';

export type PlayerKind = 'episode' | 'book';

export function applyCommands(kind: PlayerKind): void {
  const prefs = podcastPrefs();
  const book = kind === 'book';
  TrackPlayer.setCommands({
    capabilities: [
      PlayerCommand.PlayPause,
      PlayerCommand.SkipBackward,
      PlayerCommand.SkipForward,
      PlayerCommand.Seek,
      ...(book ? [] : [PlayerCommand.Next]),
    ],
    ...(book
      ? {
          handling: 'hybrid' as const,
          perCommandHandling: {
            [PlayerCommand.Seek]: 'js' as const,
            [PlayerCommand.SkipForward]: 'js' as const,
            [PlayerCommand.SkipBackward]: 'js' as const,
          },
        }
      : { handling: 'native' as const }),
    backwardInterval: prefs.skipBackSec,
    forwardInterval: prefs.skipForwardSec,
  });
}

/**
 * Sends the skip lengths to the native player again whenever the listener
 * changes them with something loaded, so the lock screen's skip buttons are
 * the lengths the app's own are, now rather than from the next item. Returns
 * the way to stop.
 */
export function followSkipLengths(loadedKind: () => PlayerKind | null): () => void {
  return usePodcastPrefs.subscribe((next, previous) => {
    const changed = next.skipBackSec !== previous.skipBackSec || next.skipForwardSec !== previous.skipForwardSec;
    const kind = loadedKind();
    if (changed && kind) applyCommands(kind);
  });
}
