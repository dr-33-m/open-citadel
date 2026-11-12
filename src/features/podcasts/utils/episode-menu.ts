import type { MenuRow } from '@/components/menu-list';
import type { EpisodeItem } from '@/services/podcasts/records';

export type EpisodeAction =
  | 'play'
  | 'play-next'
  | 'queue-last'
  | 'dequeue'
  | 'download'
  | 'remove-download'
  | 'favorite'
  | 'unfavorite'
  | 'played'
  | 'unplayed'
  | 'seen'
  | 'reset'
  | 'share'
  | 'website'
  | 'show'
  | 'highlights';

type Row = MenuRow<EpisodeAction>;

function queueRows(episode: EpisodeItem): Row[] {
  if (episode.queuePosition == null) {
    return [
      { key: 'play-next', label: 'Play next' },
      { key: 'queue-last', label: 'Add to Up Next' },
    ];
  }
  return [
    { key: 'play-next', label: 'Move to the top of Up Next' },
    { key: 'queue-last', label: 'Move to the end of Up Next' },
    { key: 'dequeue', label: 'Remove from Up Next' },
  ];
}

/**
 * Which actions make sense for an episode in the state it is in, in menu
 * order. `isCurrent` is the episode in the player, playing or paused.
 */
export function episodeMenu(
  episode: EpisodeItem,
  options: { showLink: boolean; isCurrent?: boolean; highlights?: boolean },
): Row[] {
  const rows: Row[] = [{ key: 'play', label: episode.positionSec > 0 && episode.playState !== 'played' ? 'Resume' : 'Play' }];
  // Only where the screen can open them (the player), and only once there are some.
  if (options.highlights) rows.push({ key: 'highlights', label: 'Highlights' });
  // The episode in the player is already what plays now: Up Next is for what comes after it.
  if (!options.isCurrent) rows.push(...queueRows(episode));
  if (episode.downloadStatus === 'downloaded' || episode.downloadStatus === 'downloading' || episode.downloadStatus === 'queued') {
    rows.push({ key: 'remove-download', label: episode.downloadStatus === 'downloaded' ? 'Remove download' : 'Cancel download' });
  } else {
    rows.push({ key: 'download', label: 'Download' });
  }
  rows.push(
    episode.isFavorite
      ? { key: 'unfavorite', label: 'Remove from Favorites' }
      : { key: 'favorite', label: 'Add to Favorites' },
  );
  if (episode.playState === 'new') rows.push({ key: 'seen', label: 'Remove from Just Arrived' });
  rows.push(
    episode.playState === 'played'
      ? { key: 'unplayed', label: 'Mark as unplayed', tone: 'muted' }
      : { key: 'played', label: 'Mark as played', tone: 'gold' },
  );
  if (episode.positionSec > 0 && episode.playState !== 'played') {
    rows.push({ key: 'reset', label: 'Start from the beginning', tone: 'muted' });
  }
  rows.push({ key: 'share', label: 'Share' });
  if (episode.link) rows.push({ key: 'website', label: 'Open the episode website' });
  if (options.showLink) rows.push({ key: 'show', label: `Go to ${episode.showTitle}` });
  return rows;
}

