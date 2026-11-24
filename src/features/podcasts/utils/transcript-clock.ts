/**
 * A transcript's lines on the clock of the copy of the episode being heard.
 *
 * A transcript made from one copy of an episode runs early or late on another
 * that carries other ads (`samwell-shared` `time-map`). The lines themselves
 * stay as they are, on the transcript's clock, which highlights and Samwell
 * are given; what is drawn beside each and what is followed is where it is
 * heard in this copy, so the time by a line is the time on the player.
 *
 * Pure, so it can be tested on its own.
 */
import { toAudioTime, type TimeMap } from 'samwell-shared';

import type { TranscriptLine } from '@/features/podcasts/utils/transcript-lines';
import { formatClock } from '@/utils/clock';

export interface CopyClock {
  /** When each line is heard, by index, for following the player. */
  starts: number[];
  /** The time drawn beside each line, by index; null for a transcript without times. */
  times: (string | null)[];
}

export function copyClock(lines: readonly TranscriptLine[], map: TimeMap): CopyClock {
  if (map.length === 0) return { starts: lines.map((line) => line.start), times: lines.map((line) => line.time) };
  const starts = lines.map((line) => toAudioTime(map, line.start));
  return { starts, times: lines.map((line, i) => (line.time === null ? null : formatClock(starts[i]!))) };
}
