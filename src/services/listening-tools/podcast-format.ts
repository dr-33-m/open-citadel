/**
 * The podcasts as Samwell reads them: one line a show or an episode, within
 * the tool result budget. Pure.
 */
import { clamp, day, duration, fitLines, plural } from '@/services/listening-tools/format';

export interface ShowSummary {
  id: string;
  title: string;
  author: string | null;
  following: boolean;
  episodes: number;
  played: number;
  inProgress: number;
  fresh: number;
  favorites: number;
  upNext: number;
  downloaded: number;
  secondsListened: number;
  lastPlayedAt: string | null;
}

export interface ListeningTotals {
  secondsLast7Days: number;
  secondsLast30Days: number;
  finishedLast30Days: number;
  upNext: number;
}

export interface EpisodeSummary {
  id: string;
  show: string;
  title: string;
  publishedAt: string | null;
  durationSec: number;
  playState: 'new' | 'unplayed' | 'played';
  positionSec: number;
  secondsListened: number;
  lastPlayedAt: string | null;
  completedAt: string | null;
  favorite: boolean;
  upNextPosition: number | null;
  downloaded: boolean;
  summary: string | null;
}

export function formatShows(shows: readonly ShowSummary[], totals: ListeningTotals, tokenBudget: number): string {
  if (shows.length === 0) return 'They follow no podcasts yet, or none matched.';
  const head =
    `Listening lately: ${duration(totals.secondsLast7Days)} in the last 7 days, ${duration(totals.secondsLast30Days)} in the last 30, ` +
    `${plural(totals.finishedLast30Days, 'episode')} finished in the last 30 days, ${totals.upNext} in Up Next.\n` +
    `${plural(shows.length, 'show')}, most recently listened first:`;
  const entries = shows.map((show) => {
    const facts = [
      plural(show.episodes, 'episode'),
      `${show.played} played`,
      show.inProgress > 0 ? `${show.inProgress} partway` : null,
      show.fresh > 0 ? `${show.fresh} new` : null,
      show.favorites > 0 ? `${show.favorites} favourited` : null,
      show.upNext > 0 ? `${show.upNext} in Up Next` : null,
      show.downloaded > 0 ? `${show.downloaded} downloaded` : null,
      show.secondsListened > 0 ? `${duration(show.secondsListened)} listened` : null,
      show.lastPlayedAt ? `last listened ${day(show.lastPlayedAt)}` : 'never listened',
      show.following ? null : 'not followed',
    ].filter(Boolean);
    return `- "${show.title}"${show.author ? ` by ${show.author}` : ''}: ${facts.join('; ')}`;
  });
  return fitLines(head, entries, tokenBudget, 'shows');
}

function episodeState(episode: EpisodeSummary): string {
  if (episode.playState === 'played') {
    return `played${episode.completedAt ? ` (finished ${day(episode.completedAt)})` : ''}`;
  }
  if (episode.positionSec > 0) {
    const left = Math.max(0, episode.durationSec - episode.positionSec);
    return `partway, at ${duration(episode.positionSec)}${episode.durationSec > 0 ? ` with ${duration(left)} left` : ''}`;
  }
  return episode.playState === 'new' ? 'new, not looked at yet' : 'not started';
}

export function formatEpisodes(episodes: readonly EpisodeSummary[], total: number, tokenBudget: number): string {
  if (episodes.length === 0) return 'No episode matched.';
  const head = `${plural(total, 'episode')} matched${total > episodes.length ? `, the first ${episodes.length} here` : ''}:`;
  const entries = episodes.map((episode) => {
    const facts = [
      episode.publishedAt ? `out ${day(episode.publishedAt)}` : null,
      episode.durationSec > 0 ? duration(episode.durationSec) : null,
      episodeState(episode),
      episode.lastPlayedAt && episode.playState !== 'played' ? `last listened ${day(episode.lastPlayedAt)}` : null,
      episode.favorite ? 'favourite' : null,
      episode.upNextPosition !== null ? `Up Next #${episode.upNextPosition}` : null,
      episode.downloaded ? 'downloaded' : null,
    ].filter(Boolean);
    const lines = [`- "${episode.title}" (${episode.show}): ${facts.join('; ')}`];
    if (episode.summary) lines.push(`  ${clamp(episode.summary, 240)}`);
    lines.push(`  episode_id: ${episode.id}`);
    return lines.join('\n');
  });
  return fitLines(head, entries, tokenBudget, 'episodes');
}

export function formatEpisode(
  episode: EpisodeSummary & { link: string | null; notes: string | null },
  chapters: readonly { startSec: number; title: string }[],
  maxNotesChars: number,
): string {
  const lines = [
    `"${episode.title}", from ${episode.show}`,
    [
      episode.publishedAt ? `Out ${day(episode.publishedAt)}` : null,
      episode.durationSec > 0 ? duration(episode.durationSec) : null,
      episodeState(episode),
      episode.favorite ? 'a favourite' : null,
      episode.upNextPosition !== null ? `Up Next #${episode.upNextPosition}` : null,
    ]
      .filter(Boolean)
      .join('; '),
  ];
  if (episode.link) lines.push(`Link: ${episode.link}`);
  if (chapters.length > 0) {
    lines.push('', 'Chapters:', ...chapters.map((c) => `- ${clock(c.startSec)} ${c.title}`));
  }
  lines.push('', 'Show notes (the publisher’s, not a transcript):', episode.notes ? clamp(episode.notes, maxNotesChars) : '(none)');
  return lines.join('\n');
}

/** "1:02:05" or "12:05". */
function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n: number) => String(n).padStart(2, '0');
  const hours = Math.floor(s / 3600);
  return hours > 0 ? `${hours}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
