/**
 * A time in an episode as a clock reads it. Pure. Shared by the podcast
 * screens, a transcript's rows and the EPUB a transcript is written into.
 */

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
