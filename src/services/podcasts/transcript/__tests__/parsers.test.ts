import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { HARD_CUT_SECONDS } from 'samwell-shared';
import { describe, expect, it } from 'vitest';

import { parseClock, speakerPrefixes } from '@/services/podcasts/transcript/cues';
import { bestTranscript, transcriptFormat } from '@/services/podcasts/transcript/formats';
import { parseFeedTranscript, sniffTranscriptFormat } from '@/services/podcasts/transcript/parse';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('choosing a feed transcript', () => {
  it('keeps the richest of the four Buzzsprout publishes', () => {
    const list = [
      { url: 'https://b.com/t', type: 'text/html' },
      { url: 'https://b.com/t.json', type: 'application/json' },
      { url: 'https://b.com/t.srt', type: 'application/x-subrip' },
      { url: 'https://b.com/t.vtt', type: 'text/vtt' },
    ];
    expect(bestTranscript(list)?.type).toBe('application/json');
    expect(bestTranscript(list.slice(2))?.type).toBe('text/vtt');
    expect(bestTranscript([{ url: null, type: 'application/json' }])).toBeNull();
  });

  it('reads the format from the MIME type, then the file name', () => {
    expect(transcriptFormat('application/srt')).toBe('srt');
    expect(transcriptFormat(null, 'https://x.com/ep.vtt?x=1')).toBe('vtt');
    expect(transcriptFormat('application/octet-stream', 'https://x.com/ep')).toBeNull();
  });
});

describe('parseClock', () => {
  it('reads every clock the formats write', () => {
    expect(parseClock('00:01:02.500')).toBe(62.5);
    expect(parseClock('00:00:01,524')).toBe(1.524);
    expect(parseClock('1:02:10')).toBe(3730);
    expect(parseClock('3:30')).toBe(210);
    expect(parseClock('12.5')).toBe(12.5);
    expect(parseClock('soon')).toBeNull();
  });
});

describe('real files', () => {
  it('JSON: one word per segment, merged into turns by speaker', () => {
    const doc = parseFeedTranscript(fixture('buzzsprout.json'), 'json')!;
    expect(doc.source).toBe('feed');
    expect(doc.speakers).toEqual(['Speaker 1', 'Speaker 2']);
    expect(doc.segments[0].text.startsWith('Hey, Travis Albritton here.')).toBe(true);
    expect(doc.segments[0].speaker).toBe(0);
    for (const s of doc.segments) expect(s.end - s.start).toBeLessThanOrEqual(HARD_CUT_SECONDS + 1);
    expect(doc.segments.some((s) => s.speaker === 1)).toBe(true);
  });

  it('WebVTT: voices from the <v> tag', () => {
    const doc = parseFeedTranscript(fixture('buzzsprout.vtt'), 'vtt')!;
    expect(doc.speakers).toEqual(['Speaker 1', 'Speaker 2']);
    expect(doc.segments[0]).toMatchObject({ start: 0.3, speaker: 0 });
    expect(doc.segments[0].text).toContain('Hey, Travis Albritton here.');
    expect(doc.segments.map((s) => s.text).join(' ')).not.toContain('<v');
  });

  it('SRT: a "SPEAKER_00:" opening holds until the next speaker', () => {
    const doc = parseFeedTranscript(fixture('buzzsprout.srt'), 'srt')!;
    expect(doc.segments[0].text.startsWith('Hey, Travis Albritton here.')).toBe(true);
    expect(doc.segments[0].speaker).toBe(0);
    expect(doc.segments.map((s) => s.text).join(' ')).not.toContain('SPEAKER_0');
  });

  it('SRT with no speakers at all', () => {
    const doc = parseFeedTranscript(fixture('podcasting20.srt'), 'srt')!;
    expect(doc.speakers).toEqual([]);
    expect(doc.segments[0]).toMatchObject({ start: 0.96, speaker: null });
    expect(doc.segments[0].text.startsWith('Podcasting 2.0 for October 16th, 2026')).toBe(true);
    expect(doc.durationSec).toBeGreaterThan(60);
  });

  it('HTML: Buzzsprout timed words, speakers from <cite>, unknown is nobody', () => {
    const doc = parseFeedTranscript(fixture('buzzsprout.html'), 'html')!;
    expect(doc.segments[0]).toMatchObject({ start: 0.3, speaker: 0 });
    expect(doc.segments[0].text.startsWith('Hey, Travis Albritton here.')).toBe(true);
    expect(doc.segments[doc.segments.length - 1]).toMatchObject({ speaker: null, text: 'it?' });
  });

  it('sniffs a body the feed misnamed', () => {
    expect(sniffTranscriptFormat(fixture('buzzsprout.vtt'))).toBe('vtt');
    expect(sniffTranscriptFormat(fixture('podcasting20.srt'))).toBe('srt');
    const doc = parseFeedTranscript(fixture('buzzsprout.vtt'), 'json');
    expect(doc?.segments.length).toBeGreaterThan(0);
  });
});

describe('untimed text', () => {
  it('keeps paragraphs and names a speaker the file keeps naming', () => {
    const doc = parseFeedTranscript('Ada: Hello there.\n\nBen: Hi.\n\nNote: this is not a person.\n\nAda: Shall we?', 'text')!;
    expect(doc.speakers).toEqual(['Ada', 'Ben']);
    expect(doc.segments.map((s) => [s.speaker, s.text])).toEqual([
      [0, 'Hello there.'],
      [1, 'Hi.'],
      [null, 'Note: this is not a person.'],
      [0, 'Shall we?'],
    ]);
    expect(doc.durationSec).toBe(0);
  });

  it('reads untimed HTML paragraphs', () => {
    const doc = parseFeedTranscript('<p>Ada: One.</p><p>Ben: Two &amp; three.</p><p>Ada: Four.</p>', 'html')!;
    expect(doc.segments.map((s) => s.text)).toEqual(['One.', 'Two & three.', 'Four.']);
  });

  it('counts openings as speakers only once the file has the habit', () => {
    expect([...speakerPrefixes(['Note: a', 'Ada: b', 'Ada: c', 'Ben: d'])].sort()).toEqual(['Ada', 'Ben']);
    expect([...speakerPrefixes(['Note: a', 'Ada: b'])]).toEqual([]);
  });
});
