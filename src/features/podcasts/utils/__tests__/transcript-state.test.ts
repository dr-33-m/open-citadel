import type { TranscriptDoc } from 'samwell-shared';
import { describe, expect, it } from 'vitest';

import { followLines, lineMatches } from '@/features/podcasts/utils/transcript-lines';
import { linePassage, matchLabel, segmentIndexAt } from '@/features/podcasts/utils/transcript-rows';
import { confirmFigure, jobFailureToast, refusalToast, transcriptButtons, transcriptView } from '@/features/podcasts/utils/transcript-state';

const doc: TranscriptDoc = {
  version: 1,
  source: 'scribe',
  language: 'en',
  durationSec: 100,
  speakers: ['Lex Fridman', 'Speaker 2'],
  segments: [
    { start: 0, end: 10, speaker: 0, text: 'Hello there.' },
    { start: 10, end: 20, speaker: 0, text: 'On compound interest.' },
    { start: 20, end: 30, speaker: 1, text: 'Compounding, yes. Café.' },
  ],
};

describe('transcriptView', () => {
  it('prefers what is on the phone, then a running job, then the feed', () => {
    expect(transcriptView({ transcriptStatus: 'ready', transcriptUrl: 'x' })).toBe('ready');
    expect(transcriptView({ transcriptStatus: 'transcribing', transcriptUrl: null })).toBe('transcribing');
    expect(transcriptView({ transcriptStatus: 'none', transcriptUrl: 'https://x/t.vtt' })).toBe('feed');
    expect(transcriptView({ transcriptStatus: 'none', transcriptUrl: null })).toBe('none');
  });
});

describe('transcriptButtons', () => {
  it('says what each state does', () => {
    expect(transcriptButtons('none', null)).toMatchObject({ transcriptLabel: 'Transcribe', samwellDimmed: false });
    expect(transcriptButtons('feed', null).transcriptLabel).toBe('Transcript');
    expect(transcriptButtons('transcribing', 0.4)).toEqual({ transcriptLabel: 'Transcribing 40%', progress: 0.4, samwellLabel: 'Ready soon', samwellDimmed: true });
  });
});

describe('confirmFigure', () => {
  it('shows the cost and the balance', () => {
    expect(confirmFigure(5_400, 7_423)).toEqual({ figure: '413 Neurons', line: '1 hr 30 min. You have 7,423.', credits: 413, short: null });
  });

  it('turns into the shortfall when there are too few', () => {
    expect(confirmFigure(5_400, 100)).toMatchObject({ figure: '313 Neurons short', short: 313 });
  });

  it('leaves a balance not yet known unsaid, and never short', () => {
    expect(confirmFigure(5_400, null)).toMatchObject({ figure: '413 Neurons', line: '1 hr 30 min.', short: null });
  });

  it('says "up to" for a feed that gives no length', () => {
    expect(confirmFigure(0, 5_000)).toMatchObject({ figure: 'Up to 550 Neurons', line: 'Length not given. You have 5,000.' });
  });
});

describe('toasts', () => {
  it('leaves plans and shortfalls to their sheets', () => {
    expect(refusalToast('plan_required')).toBeNull();
    expect(refusalToast('insufficient_credits')).toBeNull();
    expect(refusalToast('busy')).toBe('Another episode is still being transcribed.');
    expect(jobFailureToast('audio_unreachable')).toContain("couldn't be reached");
    expect(jobFailureToast('expired')).toBeNull();
  });
});

describe('segmentIndexAt', () => {
  const starts = [0, 10, 20, 30];
  it('finds the row being spoken', () => {
    expect(segmentIndexAt(starts, 0)).toBe(0);
    expect(segmentIndexAt(starts, 19.9)).toBe(1);
    expect(segmentIndexAt(starts, 20)).toBe(2);
    expect(segmentIndexAt(starts, 999)).toBe(3);
    expect(segmentIndexAt([5, 10], 1)).toBe(-1);
    expect(segmentIndexAt([], 4)).toBe(-1);
  });
});

describe('search', () => {
  it('matches words and the name heading a turn, ignoring case and accents', () => {
    const lines = followLines(doc);
    expect(lineMatches(lines, 'compound')).toEqual([1, 2]);
    expect(lineMatches(lines, 'cafe')).toEqual([2]);
    expect(lineMatches(lines, 'lex')).toEqual([0]);
    expect(lineMatches(lines, 'c')).toEqual([]);
  });

  it('labels the place in the matches', () => {
    expect(matchLabel(12, 3, 'compound')).toBe('4 of 12');
    expect(matchLabel(0, 0, 'zz')).toBe('No matches');
    expect(matchLabel(3, 0, '')).toBeNull();
  });
});

describe('linePassage', () => {
  it('hands Samwell the line, timed and named, with the blocks around it', () => {
    const lines = followLines(doc);
    const { passage, context } = linePassage(doc, lines[1]);
    expect(passage).toBe('[0:10] Lex Fridman: On compound interest.');
    expect(context.split('\n')).toHaveLength(3);
  });
});

describe('pickerEmptyText', () => {
  it('names the window it is empty for', async () => {
    const { pickerEmptyText } = await import('@/features/podcasts/utils/episode-picker');
    expect(pickerEmptyText('week')).toBe('No transcripts this week. Open an episode and tap Transcribe.');
    expect(pickerEmptyText('all')).toBe('No transcripts yet. Open an episode and tap Transcribe.');
  });
});
