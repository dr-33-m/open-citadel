import type { TranscriptDoc } from 'samwell-shared';
import { describe, expect, it } from 'vitest';

import { applySpeakerNames, speakerNamesInput } from '../speaker-names.js';

const doc: TranscriptDoc = {
  version: 1,
  source: 'scribe',
  language: 'en',
  durationSec: 60,
  speakers: ['Speaker 1', 'Speaker 2', 'Speaker 3'],
  segments: [
    { start: 0, end: 5, speaker: 0, text: "Welcome back, I'm Lex." },
    { start: 5, end: 9, speaker: 1, text: 'Thanks for having me.' },
    { start: 9, end: 12, speaker: 2, text: 'Hm.' },
  ],
};

describe('applySpeakerNames', () => {
  it('names the speakers Samwell is sure of and leaves the rest', () => {
    const named = applySpeakerNames(doc, {
      speakers: [
        { speaker: 1, name: '  Lex   Fridman ' },
        { speaker: 2, name: null },
        { speaker: 3, name: '' },
      ],
    });
    expect(named.speakers).toEqual(['Lex Fridman', 'Speaker 2', 'Speaker 3']);
    expect(named.segments).toBe(doc.segments);
  });

  it('ignores a name for a speaker that does not exist', () => {
    const named = applySpeakerNames(doc, { speakers: [{ speaker: 0, name: 'Nobody' }, { speaker: 9, name: 'Ghost' }] });
    expect(named.speakers).toEqual(doc.speakers);
  });

  it('keeps the defaults when there is no answer', () => {
    expect(applySpeakerNames(doc, null)).toBe(doc);
  });
});

describe('speakerNamesInput', () => {
  it('shows each speaker their own opening lines under their label', () => {
    const input = speakerNamesInput(doc, { title: 'Ep 1', showTitle: 'The Show', notes: 'Lex talks to Ada.' });
    expect(input).toContain('Show: The Show');
    expect(input).toContain('Speaker 1:\n- Welcome back');
    expect(input).toContain('Speaker 2:\n- Thanks for having me.');
    expect(input).toContain('Lex talks to Ada.');
  });
});
