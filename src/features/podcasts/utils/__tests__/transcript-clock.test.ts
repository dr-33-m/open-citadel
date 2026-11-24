import { describe, expect, it } from 'vitest';

import { copyClock } from '@/features/podcasts/utils/transcript-clock';
import type { TranscriptLine } from '@/features/podcasts/utils/transcript-lines';

const line = (index: number, start: number, timed = true): TranscriptLine => ({
  index,
  segment: index,
  start,
  time: timed ? `${Math.floor(start / 60)}:${String(start % 60).padStart(2, '0')}` : null,
  text: `Line ${index}`,
  speaker: null,
  heading: null,
});

// The transcribed copy opened with a 30s ad this copy does not have.
const map = [{ audioStart: 0, audioEnd: 3_000, transcriptStart: 30 }];

describe('copyClock', () => {
  it('is the transcript’s own times with no map', () => {
    expect(copyClock([line(0, 10), line(1, 70)], [])).toEqual({ starts: [10, 70], times: ['0:10', '1:10'] });
  });

  it('follows and labels each line where it is heard, leaving the lines as they are', () => {
    const lines = [line(0, 40), line(1, 130)];
    expect(copyClock(lines, map)).toEqual({ starts: [10, 100], times: ['0:10', '1:40'] });
    expect(lines.map((l) => l.start)).toEqual([40, 130]);
  });

  it('leaves an untimed line untimed', () => {
    expect(copyClock([line(0, 0, false)], map).times).toEqual([null]);
  });
});
