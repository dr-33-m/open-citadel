import type { ImportSummary } from '@/services/podcasts/antennapod/types';
import { formatCount } from '@/utils/format';

/** What an import brought in, whichever kind of file it was. */
export type ImportResult =
  | { kind: 'database'; summary: ImportSummary }
  | { kind: 'opml'; added: number; failed: number };

/** One figure on the done screen: the number, and what it counts. */
export type ImportStat = { key: string; value: string; label: string };


function stat(key: string, n: number, one: string, many: string): ImportStat {
  return { key, value: formatCount(n), label: n === 1 ? one : many };
}

/**
 * The figures an import is summed up by. Shows and episodes always, since
 * they are what was asked for; the rest only when there was some, so nothing
 * that did not happen is listed as a zero.
 */
export function importStats(result: ImportResult): ImportStat[] {
  if (result.kind === 'opml') {
    return [
      stat('shows', result.added, 'SHOW FOLLOWED', 'SHOWS FOLLOWED'),
      ...(result.failed > 0 ? [stat('failed', result.failed, 'FEED UNREACHABLE', 'FEEDS UNREACHABLE')] : []),
    ];
  }
  const s = result.summary;
  const optional: ImportStat[] = [
    ...(s.inProgress > 0 ? [stat('progress', s.inProgress, 'PART-WAY', 'PART-WAY')] : []),
    ...(s.played > 0 ? [stat('played', s.played, 'PLAYED', 'PLAYED')] : []),
    ...(s.favorites > 0 ? [stat('favorites', s.favorites, 'FAVORITE', 'FAVORITES')] : []),
    ...(s.queued > 0 ? [stat('queued', s.queued, 'IN UP NEXT', 'IN UP NEXT')] : []),
  ];
  return [stat('shows', s.shows, 'SHOW', 'SHOWS'), stat('episodes', s.episodes, 'EPISODE', 'EPISODES'), ...optional];
}

/** The done screen's headline, and the one thing still worth knowing. */
export function importOutcome(result: ImportResult): { title: string; note: string } {
  if (result.kind === 'opml') {
    return {
      title: 'Your shows are here',
      note: 'An OPML file carries only the shows you follow. The database export brings your listening history too.',
    };
  }
  const { skipped } = result.summary;
  // Said rather than silently dropped: the listener will look for them.
  const left =
    skipped === 0
      ? ''
      : skipped === 1
        ? ' One local-folder show stayed behind, since its files are on the other device.'
        : ` ${formatCount(skipped)} local-folder shows stayed behind, since their files are on the other device.`;
  return {
    title: 'Welcome back',
    note: `Downloads stay in AntennaPod, so download again anything you want offline. New episodes are on their way.${left}`,
  };
}

/** The progress line under the bar: counted in shows, or the file still being read. */
export function importProgressLabel(done: number, total: number): string {
  if (total === 0) return 'READING THE FILE';
  return `${formatCount(done)} OF ${formatCount(total)} ${total === 1 ? 'SHOW' : 'SHOWS'}`;
}
