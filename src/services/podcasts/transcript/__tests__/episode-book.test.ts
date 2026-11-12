import type { TranscriptDoc } from 'samwell-shared';
import { describe, expect, it } from 'vitest';

import { episodeEpubFiles, episodeParts, segmentLabel } from '@/services/podcasts/transcript/episode-epub';
import { episodeChatPrompt, transcriptLines } from '@/services/podcasts/transcript/episode-prompt';
import { windowStart } from '@/services/podcasts/transcript/windows';

const doc: TranscriptDoc = {
  version: 1,
  source: 'scribe',
  language: 'en',
  durationSec: 2_000,
  speakers: ['Lex Fridman', 'Speaker 2'],
  segments: [
    { start: 0, end: 30, speaker: 0, text: 'Welcome & hello.' },
    { start: 724, end: 750, speaker: 1, text: 'On index funds <briefly>.' },
    { start: 1_900, end: 1_990, speaker: null, text: 'Music.' },
  ],
};

describe('episodeParts', () => {
  it('cuts fifteen minute parts named by their times when there are no chapters', () => {
    const parts = episodeParts(doc, []);
    expect(parts.map((p) => [p.title, p.segments])).toEqual([
      ['0:00 to 15:00', [0, 1]],
      ['30:00 to 33:20', [2]],
    ]);
  });

  it("uses the episode's own chapters, with anything before the first in it", () => {
    const parts = episodeParts(doc, [{ startSec: 600, title: 'Money' }, { startSec: 10, title: 'Intro' }]);
    expect(parts.map((p) => [p.title, p.segments])).toEqual([
      ['Intro', [0]],
      ['Money', [1, 2]],
    ]);
  });

  it('is one part for an untimed transcript', () => {
    const untimed = { ...doc, segments: doc.segments.map((s) => ({ ...s, start: 0, end: 0 })) };
    expect(episodeParts(untimed, [{ startSec: 600, title: 'Money' }])).toEqual([{ title: 'Transcript', startSec: 0, segments: [0, 1, 2] }]);
  });
});

describe('episodeEpubFiles', () => {
  it('opens each paragraph with its speaker and time, escaped, with an id per segment', () => {
    const files = episodeEpubFiles({ episodeId: 'e1', title: 'Ep & One', showTitle: 'Show', pubDate: null, link: null, doc, chapters: [] });
    expect(Object.keys(files)).toEqual(['mimetype', 'META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml', 'OEBPS/part1.xhtml', 'OEBPS/part2.xhtml']);
    const part1 = files['OEBPS/part1.xhtml'];
    expect(part1).toContain('<p id="s0"><strong>Lex Fridman · 0:00</strong> Welcome &amp; hello.</p>');
    expect(part1).toContain('<p id="s1"><strong>Speaker 2 · 12:04</strong> On index funds &lt;briefly&gt;.</p>');
    expect(files['OEBPS/content.opf']).toContain('<dc:title>Ep &amp; One</dc:title>');
    expect(files['OEBPS/nav.xhtml']).toContain('<a href="part2.xhtml">30:00 to 33:20</a>');
  });

  it('labels a speakerless segment by its time alone', () => {
    expect(segmentLabel(doc, 2)).toBe('31:40');
  });
});

describe('episodeChatPrompt', () => {
  it('gives titles, chapters, position, the citation rule and the transcript', () => {
    const prompt = episodeChatPrompt({
      title: 'Ep',
      showTitle: 'Show',
      durationSec: 5_400,
      chapters: [{ startSec: 0, title: 'Intro' }],
      positionSec: 2_530,
      doc,
    });
    expect(prompt).toContain('"Ep" from "Show" (1:30:00 long)');
    expect(prompt).toContain('0:00 Intro');
    expect(prompt).toContain('They are at 42:10');
    expect(prompt).toContain('[12:04]');
    expect(prompt).toContain('[12:04] Speaker 2: On index funds');
    expect(prompt).not.toContain('search_reading');
  });

  it('points at search for a transcript longer than the budget', () => {
    const long = { ...doc, segments: Array.from({ length: 400 }, (_, i) => ({ start: i * 10, end: i * 10 + 9, speaker: 0, text: 'word '.repeat(10) })) };
    const lines = transcriptLines(long, 6_000);
    expect(lines.cut).toBe(true);
    expect(lines.text.length).toBeLessThanOrEqual(6_000);
    expect(episodeChatPrompt({ title: 'Ep', showTitle: 'S', durationSec: 0, chapters: [], positionSec: 0, doc: long })).toContain(
      'use search_reading and read_chapter with book_title "Ep"',
    );
  });
});

describe('windowStart', () => {
  const now = new Date('2026-10-19T15:00:00Z');
  it('has no limit for All, and looks back a week or a month', () => {
    expect(windowStart('all', now)).toBeNull();
    expect(windowStart('week', now)).toBe('2026-10-12T15:00:00.000Z');
    expect(windowStart('month', now)).toBe('2026-09-19T15:00:00.000Z');
    expect(new Date(windowStart('today', now)!).getHours()).toBe(0);
  });
});
