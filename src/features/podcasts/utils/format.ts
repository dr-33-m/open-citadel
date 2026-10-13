/**
 * How podcast times and dates read on screen. Pure.
 *
 * Durations are written the way people say them ("1 hr 5 min", "12 min
 * left"), not as clocks, everywhere except the scrubber, where a clock is the
 * thing being scrubbed.
 */
import type { EpisodeItem } from '@/services/podcasts/records';
import { formatPubDate } from '@/utils/pub-date';

/**
 * `1:02:03`, or `12:34` under an hour. For the scrubber, whose labels are
 * written on the UI thread, so it is a worklet as well as a plain function.
 */
export function formatClock(totalSec: number): string {
  'worklet';
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** `1 hr 5 min`, `45 min`, `1 min`. Empty when the length is not known. */
export function formatDuration(totalSec: number): string {
  if (!(totalSec > 0)) return '';
  const minutes = Math.max(1, Math.round(totalSec / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** How far through an episode someone is, 0..1. */
export function listenedFraction(item: Pick<EpisodeItem, 'positionSec' | 'durationSec' | 'playState'>): number {
  if (item.playState === 'played') return 1;
  if (!(item.durationSec > 0)) return 0;
  return Math.min(1, Math.max(0, item.positionSec / item.durationSec));
}

/**
 * What an episode's play control says: its length before it is started, what
 * is left once it is, and that it is done once it is done.
 */
export function playLabel(item: Pick<EpisodeItem, 'positionSec' | 'durationSec' | 'playState'>): string {
  if (item.playState === 'played') return 'Played';
  if (item.positionSec > 0 && item.durationSec > 0) {
    const left = formatDuration(item.durationSec - item.positionSec);
    return left ? `${left} left` : 'Resume';
  }
  return formatDuration(item.durationSec) || 'Play';
}

/** `Yesterday · 1 hr 5 min`: the line over an episode's title. */
export function episodeMeta(item: Pick<EpisodeItem, 'pubDate' | 'durationSec'>): string {
  return [formatPubDate(item.pubDate), formatDuration(item.durationSec)].filter(Boolean).join(' · ');
}

/** `1.5×`, `1×`. */
export function formatSpeed(speed: number): string {
  return `${Number(speed.toFixed(2))}×`;
}
