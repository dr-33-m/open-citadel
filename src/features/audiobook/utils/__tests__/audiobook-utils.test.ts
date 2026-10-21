import { describe, expect, it } from 'vitest';

import {
  atRate,
  bookPosition,
  learnPace,
  measuredBySection,
  NO_PACE,
  paceOf,
  sectionAt,
  sentenceAt,
  steadyPace,
  timeline,
  type ClockSection,
  type Measured,
} from '@/features/audiobook/utils/book-clock';
import { formatListenTime, listenEstimate } from '@/features/audiobook/utils/listen-estimate';
import { shouldMakeMore } from '@/features/audiobook/utils/produce-ahead';
import {
  bookFraction,
  CONTEXT_CHARS,
  highlightLocator,
  highlightTarget,
  placeLocator,
  sectionText,
} from '@/features/audiobook/utils/sentence-locator';
import { sectionOfId, sentencesOf, type ScriptParagraph, type Sentence } from '@/features/audiobook/utils/sentences-of';
import { startIndex, startPlace, type PlaceSection } from '@/features/audiobook/utils/start-place';
import { CHARACTERS_PER_SECOND } from 'samwell-shared';

const paragraphs = (section: number, texts: string[]): ScriptParagraph[] => {
  let start = 0;
  return texts.map((text, i) => {
    const p = { section, n: i + 1, start, text };
    start += text.length + 2;
    return p;
  });
};

describe('sentencesOf', () => {
  it('cuts paragraphs into sentences with stable ids and offsets into the section', () => {
    const ps = paragraphs(3, ['It was late. The rain had stopped.', 'She waited.']);
    const out = sentencesOf(ps, 1_500);
    expect(out.map((s) => s.id)).toEqual(['3:1:0', '3:1:1', '3:2:0']);
    expect(out.map((s) => s.text)).toEqual(['It was late.', 'The rain had stopped.', 'She waited.']);
    const text = sectionText(ps);
    for (const s of out) expect(text.slice(s.offset, s.offset + s.text.length)).toBe(s.text);
  });

  it('cuts a sentence over the limit into parts that are tracks of their own', () => {
    const long = `${'word '.repeat(30).trim()}, and ${'more '.repeat(30).trim()}.`;
    const out = sentencesOf(paragraphs(0, [long]), 100);
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((s) => s.text.length <= 100)).toBe(true);
    expect(out.map((s) => s.id)).toEqual(out.map((_, i) => `0:1:${i}`));
    for (const s of out) expect(long.slice(s.offset, s.offset + s.text.length)).toBe(s.text);
  });

  it('reads the section back out of an id', () => {
    expect(sectionOfId('12:4:2')).toBe(12);
    expect(sectionOfId('nope')).toBeNull();
  });
});

function sentence(id: string, text: string, offset = 0): Sentence {
  const [section, paragraph] = id.split(':').map(Number);
  return { id, section, paragraph, offset, text };
}

describe('book clock', () => {
  const pace = 10;
  const sections: ClockSection[] = [
    { index: 2, chars: 100, paragraphs: 1 },
    { index: 3, chars: 202, paragraphs: 2 },
  ];
  const script3 = [sentence('3:1:0', 'a'.repeat(50)), sentence('3:1:1', 'b'.repeat(50)), sentence('3:2:0', 'c'.repeat(100))];

  it('mixes measured and estimated lengths', () => {
    const lengths = new Map<string, Measured>([
      ['2:1:0', { sec: 4, chars: 40 }],
      ['3:1:0', { sec: 6, chars: 50 }],
    ]);
    const line = timeline(sections, lengths, pace);
    // Section 2: 4s measured + 60 chars at 10/s.
    expect(line.lengths[0]).toBeCloseTo(10);
    // Section 3: 200 spoken chars, 50 of them measured at 6s.
    expect(line.lengths[1]).toBeCloseTo(6 + 15);
    expect(line.total).toBeCloseTo(31);
    expect(measuredBySection(lengths).get(3)).toEqual({ sec: 6, chars: 50 });
  });

  it('sums a section in hand sentence by sentence, so its sentences and the book agree', () => {
    const lengths = new Map<string, Measured>([['3:1:0', { sec: 6, chars: 50 }]]);
    const line = timeline(sections, lengths, pace, new Map([[3, script3]]));
    expect(line.lengths[1]).toBeCloseTo(6 + 5 + 10);
    expect(bookPosition(line, script3, 2, 3, lengths, pace)).toBeCloseTo(10 + 6 + 5 + 3);
  });

  it('maps a time to a sentence and an offset, at the first and last sentence and across a chapter edge', () => {
    const lengths = new Map<string, Measured>();
    const line = timeline(sections, lengths, pace, new Map([[3, script3]]));
    expect(sectionAt(line, 0)).toEqual({ order: 0, into: 0 });
    expect(sectionAt(line, 9.5).order).toBe(0);
    const edge = sectionAt(line, 10);
    expect(edge).toEqual({ order: 1, into: 0 });
    expect(sentenceAt(script3, edge.into, lengths, pace)).toEqual({ index: 0, offset: 0 });
    expect(sentenceAt(script3, 7, lengths, pace)).toEqual({ index: 1, offset: 2 });
    // Past the end lands on the last sentence's end.
    const end = sectionAt(line, 999);
    expect(end.order).toBe(1);
    expect(sentenceAt(script3, end.into, lengths, pace)).toEqual({ index: 2, offset: 10 });
  });

  it('applies the rate to what the listener sees', () => {
    expect(atRate(90, 1.5)).toBe(60);
    expect(atRate(90, 0)).toBe(90);
  });

  it('learns a pace once a little has been heard', () => {
    expect(paceOf(NO_PACE)).toBe(CHARACTERS_PER_SECOND);
    const learned = learnPace(learnPace(NO_PACE, { sec: 4, chars: 60 }), { sec: 6, chars: 120 });
    expect(paceOf(learned)).toBeCloseTo(18);
    expect(learnPace(learned, { sec: 0, chars: 10 })).toBe(learned);
  });

  it('keeps the clock on its pace until the learned one has really moved', () => {
    expect(steadyPace(null, 15)).toBe(15);
    expect(steadyPace(15, 15.2)).toBe(15);
    expect(steadyPace(15, 14.8)).toBe(15);
    expect(steadyPace(15, 15.5)).toBe(15.5);
    expect(steadyPace(15, 14)).toBe(14);
  });
});

describe('listenEstimate', () => {
  it('is nothing when no characters are left', () => {
    expect(listenEstimate({ charsLeft: 0, pace: 15, rate: 1, chapterCredits: 10 })).toEqual({ seconds: 0, neurons: 0 });
  });

  it('scales the voice’s chapter figure to what is left: Kokoro and Eleven', () => {
    const hour = 54_000;
    const kokoro = listenEstimate({ charsLeft: hour, pace: 15, rate: 1, chapterCredits: 18 });
    expect(kokoro.seconds).toBeCloseTo(3_600);
    expect(kokoro.neurons).toBe(43);
    const eleven = listenEstimate({ charsLeft: hour, pace: 15, rate: 1.5, chapterCredits: 1_125 });
    expect(eleven.seconds).toBeCloseTo(2_400);
    expect(eleven.neurons).toBe(2_700);
  });

  it('has no Neurons for a voice with no price', () => {
    expect(listenEstimate({ charsLeft: 1000, pace: 15, rate: 1, chapterCredits: null }).neurons).toBeNull();
  });

  it('writes a time as a figure', () => {
    expect(formatListenTime(22_320)).toBe('6 h 12 m');
    expect(formatListenTime(2_700)).toBe('45 m');
    expect(formatListenTime(7_200)).toBe('2 h');
    expect(formatListenTime(10)).toBe('1 m');
  });
});

describe('start place', () => {
  const sections: PlaceSection[] = [
    { index: 0, href: 'OEBPS/cover.xhtml', chars: 10, frontMatter: true },
    { index: 1, href: 'OEBPS/ch1.xhtml', chars: 1000, frontMatter: false },
    { index: 2, href: 'OEBPS/ch2.xhtml', chars: 2000, frontMatter: false },
  ];

  it('starts a book with no place at its first section that is not front matter', () => {
    expect(startPlace(sections, null)).toEqual({ section: 1, offset: 0 });
  });

  it('starts at the start of a section, mid-paragraph, and past the front matter', () => {
    expect(startPlace(sections, { href: 'ch2.xhtml', locations: { progression: 0 } })).toEqual({ section: 2, offset: 0 });
    expect(startPlace(sections, { href: 'ch2.xhtml', locations: { progression: 0.25 } })).toEqual({ section: 2, offset: 500 });
    expect(startPlace(sections, { href: 'cover.xhtml', locations: { progression: 0.5 } })).toEqual({ section: 1, offset: 0 });
  });

  it('picks the first sentence at or after the place, or none past the end', () => {
    const script = [sentence('1:1:0', 'One.', 0), sentence('1:1:1', 'Two.', 5), sentence('1:2:0', 'Three.', 11)];
    expect(startIndex(script, 0)).toBe(0);
    expect(startIndex(script, 3)).toBe(1);
    expect(startIndex(script, 5)).toBe(1);
    expect(startIndex(script, 50)).toBe(-1);
  });
});

describe('sentence locator', () => {
  const ps = paragraphs(1, ['First paragraph here.', `${'x'.repeat(200)}. Middle sentence. Y${'y'.repeat(199)}`]);
  const text = sectionText(ps);
  const script = sentencesOf(ps, 1_500);
  const section = { href: 'ch1.xhtml', title: 'One', chars: text.length };

  it('cuts the context at the chapter edge', () => {
    const first = highlightLocator(section, script[0], text);
    expect(first.text.before).toBeUndefined();
    expect(first.text.highlight).toBe('First paragraph here.');
    expect(first.text.after?.length).toBe(CONTEXT_CHARS);
    const last = script[script.length - 1];
    const end = highlightLocator(section, last, text);
    expect(end.text.after).toBeUndefined();
  });

  it('carries the progression into the section', () => {
    const middle = script.find((s) => s.text === 'Middle sentence.') as Sentence;
    const locator = highlightLocator(section, middle, text);
    expect(locator.locations.progression).toBeCloseTo(middle.offset / text.length);
    expect(locator.text.before?.endsWith('x. ')).toBe(true);
    expect(placeLocator(section, middle).text).toEqual({ highlight: 'Middle sentence.' });
  });

  it('means the sentence before when a tap lands in the first second', () => {
    expect(highlightTarget(4, 0.5)).toBe(3);
    expect(highlightTarget(4, 1.5)).toBe(4);
    expect(highlightTarget(0, 0.2)).toBe(0);
  });

  it('measures the whole book by characters', () => {
    const all = [
      { index: 0, chars: 100 },
      { index: 1, chars: 300 },
    ];
    expect(bookFraction(all, 1, 100)).toBeCloseTo(0.5);
    expect(bookFraction([], 0, 0)).toBe(0);
  });
});

describe('shouldMakeMore', () => {
  it('starts under two minutes, carries on to three, and applies the rate', () => {
    expect(shouldMakeMore({ aheadSec: 100, rate: 1, making: false })).toBe(true);
    expect(shouldMakeMore({ aheadSec: 150, rate: 1, making: false })).toBe(false);
    expect(shouldMakeMore({ aheadSec: 150, rate: 1, making: true })).toBe(true);
    expect(shouldMakeMore({ aheadSec: 190, rate: 1, making: true })).toBe(false);
    // At 2×, 200s of audio is 100s heard: under the floor.
    expect(shouldMakeMore({ aheadSec: 200, rate: 2, making: false })).toBe(true);
  });
});

describe('sentenceRows', () => {
  it('lists a sentence a row, marks where paragraphs begin, and finds the row a sentence is in', async () => {
    const { sentenceRows, rowOf } = await import('@/features/audiobook/utils/sentence-rows');
    const rows = sentenceRows([sentence('2:1:0', 'A.'), sentence('2:1:1', 'B.'), sentence('2:3:0', 'C.')]);
    expect(rows.map((r) => [r.sentence.id, r.opensParagraph])).toEqual([
      ['2:1:0', true],
      ['2:1:1', false],
      ['2:3:0', true],
    ]);
    expect(rowOf(rows, '2:3:0')).toBe(2);
    expect(rowOf(rows, '9:1:0')).toBe(-1);
    expect(rowOf(rows, null)).toBe(-1);
  });
});

describe('sentenceMarks', () => {
  it('marks the sentences a highlight in this chapter covers, whoever made it', async () => {
    const { sentenceMarks } = await import('@/features/audiobook/utils/sentence-marks');
    const sentences = [
      sentence('2:1:0', 'Money chasing is not business.'),
      sentence('2:1:1', 'It is very easy to get burdened with money.'),
      sentence('2:2:0', 'Business is never as healthy as when it must scratch.'),
    ];
    const at = (href: string) => JSON.stringify({ href, locations: {} });
    const marks = sentenceMarks(
      sentences,
      'ch2.xhtml',
      [
        // From the player: the sentence itself.
        { id: 'a', text: 'Money chasing is not business.', locator: at('ch2.xhtml'), color: '#ff0' },
        // From the reader: part of a sentence, with its own spacing.
        { id: 'b', text: 'never as  healthy as when', locator: at('ch2.xhtml#p4'), color: null },
        // Another chapter's: never here.
        { id: 'c', text: 'It is very easy to get burdened with money.', locator: at('ch3.xhtml'), color: '#0f0' },
        // A word or two: too common to say which sentence.
        { id: 'd', text: 'money', locator: at('ch2.xhtml'), color: '#00f' },
      ],
      '#gold',
    );
    expect(marks.get('2:1:0')).toEqual({ id: 'a', color: '#ff0' });
    expect(marks.get('2:2:0')).toEqual({ id: 'b', color: '#gold' });
    expect(marks.has('2:1:1')).toBe(false);
  });
});

describe('listenStats', () => {
  it('draws the time left and the Neurons, and leaves out an unpriced voice', async () => {
    const { listenStats } = await import('@/features/audiobook/utils/listen-estimate');
    expect(listenStats({ seconds: 22_200, neurons: 2_600 })).toEqual([
      { key: 'time', value: '6 h 10 m', label: 'ABOUT LEFT' },
      { key: 'neurons', value: '2,600', label: 'ABOUT NEURONS' },
    ]);
    expect(listenStats({ seconds: 600, neurons: null }).map((s) => s.key)).toEqual(['time']);
  });
});

describe('failureToast', () => {
  it('waits out the network, retries a voice, and sells a plan where it can', async () => {
    const { failureToast } = await import('@/features/audiobook/utils/failure-toast');
    expect(failureToast('offline', true).wayOut).toBe('wait');
    expect(failureToast('maker_failed', true)).toEqual({ message: 'That voice is not answering.', wayOut: 'retry' });
    expect(failureToast('out_of_credits', true)).toEqual({ message: 'Out of Neurons', wayOut: 'plans' });
    expect(failureToast('plan_lapsed', false).wayOut).toBe('retry');
  });
});

describe('chapterTitle', () => {
  it('drops a title that is only the book’s own name, or none', async () => {
    const { chapterTitle } = await import('@/features/audiobook/utils/chapter-title');
    expect(chapterTitle('Moby-Dick', 'Moby-Dick')).toBeNull();
    expect(chapterTitle('  moby-dick ', 'Moby-Dick')).toBeNull();
    expect(chapterTitle('', 'Moby-Dick')).toBeNull();
    expect(chapterTitle('Chapter 1. Loomings.', 'Moby-Dick')).toBe('Chapter 1. Loomings.');
  });
});
