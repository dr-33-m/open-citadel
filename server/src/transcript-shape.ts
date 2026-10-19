/**
 * Scribe's reply in, a `TranscriptDoc` out. Pure, so the merging rules can be
 * tested without a provider.
 *
 * Scribe answers with every word, each timed and labelled with its speaker.
 * A transcript read on a phone wants utterances instead: words merged while
 * the same person keeps talking, cut where a sentence ends once a block has
 * run half a minute, and cut regardless at forty seconds so a monologue is
 * still a list a finger can move through. Word timings are dropped after
 * this: they would make a two hour transcript about ten times its 200 KB.
 *
 * The reply's shape is OpenRouter's documented `verbose_json`. A word's
 * speaker may arrive as a label (`speaker_0`), a number, or not at all, so
 * every read is defensive, and a reply with no words falls back to its
 * segments, then to its plain text.
 */
import { defaultSpeakerName, type TranscriptDoc, type TranscriptSegment } from 'samwell-shared';

export interface ScribeWord {
  word?: string;
  start?: number;
  end?: number;
  speaker?: number | string | null;
  speaker_label?: string | null;
  type?: string;
}

export interface ScribeSegment {
  start?: number;
  end?: number;
  text?: string;
  speaker?: number | string | null;
  speaker_label?: string | null;
}

export interface ScribeReply {
  text?: string;
  language?: string | null;
  duration?: number | null;
  segments?: ScribeSegment[] | null;
  words?: ScribeWord[] | null;
  usage?: { cost?: number | null; seconds?: number | null } | null;
}

/** Past this a block is cut at the next sentence end. */
export const SOFT_CUT_SECONDS = 30;
/** Past this a block is cut at the next word, sentence or not. */
export const HARD_CUT_SECONDS = 40;

const SENTENCE_END = /[.!?…]["'”’)\]]*$/;
const NO_SPACE_BEFORE = /^[,.!?;:…%)\]}”’'-]/;

function speakerKey(item: { speaker?: number | string | null; speaker_label?: string | null }): string | null {
  if (item.speaker_label != null && item.speaker_label !== '') return String(item.speaker_label);
  if (item.speaker != null && item.speaker !== '') return String(item.speaker);
  return null;
}

/** Words to text: a space between them unless the word brings its own or is punctuation. */
export function joinWords(words: readonly string[]): string {
  let text = '';
  for (const raw of words) {
    if (!raw) continue;
    if (text === '' || /^\s/.test(raw) || NO_SPACE_BEFORE.test(raw) || /\s$/.test(text)) text += raw;
    else text += ` ${raw}`;
  }
  return text.replace(/\s+/g, ' ').trim();
}

/** Speakers in the order they first speak, so "Speaker 1" is whoever talks first. */
function speakerIndexer() {
  const labels: string[] = [];
  const index = (key: string | null): number | null => {
    if (key == null) return null;
    const found = labels.indexOf(key);
    if (found >= 0) return found;
    labels.push(key);
    return labels.length - 1;
  };
  return { labels, index };
}

/** Timed words merged into utterances by the cut rules above. */
export function mergeWords(
  words: readonly ScribeWord[],
  index: (key: string | null) => number | null,
): TranscriptSegment[] {
  type Block = { start: number; end: number; speaker: number | null; words: string[] };
  const segments: TranscriptSegment[] = [];
  const push = (block: Block | null) => {
    if (!block) return;
    const text = joinWords(block.words);
    if (text) segments.push({ start: block.start, end: block.end, speaker: block.speaker, text });
  };

  let open: Block | null = null;
  for (const word of words) {
    if (word.type === 'spacing') continue;
    const token = word.word ?? '';
    if (!token.trim()) continue;
    const start: number = Number.isFinite(word.start) ? (word.start as number) : (open?.end ?? 0);
    const end = Number.isFinite(word.end) ? Math.max(start, word.end as number) : start;
    const speaker = index(speakerKey(word));

    if (open && (speaker !== open.speaker || start - open.start >= HARD_CUT_SECONDS)) {
      push(open);
      open = null;
    }
    if (!open) open = { start, end, speaker, words: [] };
    open.words.push(token);
    open.end = end;
    if (open.end - open.start >= SOFT_CUT_SECONDS && SENTENCE_END.test(token.trim())) {
      push(open);
      open = null;
    }
  }
  push(open);
  return segments;
}

/** The reply's own segments, for a provider that sent no words. */
function fromSegments(
  segments: readonly ScribeSegment[],
  index: (key: string | null) => number | null,
): TranscriptSegment[] {
  return segments
    .map((segment) => {
      const start = Number.isFinite(segment.start) ? (segment.start as number) : 0;
      const end = Number.isFinite(segment.end) ? Math.max(start, segment.end as number) : start;
      return { start, end, speaker: index(speakerKey(segment)), text: (segment.text ?? '').trim() };
    })
    .filter((segment) => segment.text !== '');
}

export interface ShapedTranscript {
  doc: TranscriptDoc;
  /** Scribe's own speaker labels, in the order of `doc.speakers`. */
  labels: string[];
}

export function shapeScribeReply(reply: ScribeReply, fallbackDurationSec = 0): ShapedTranscript {
  const { labels, index } = speakerIndexer();
  const words = Array.isArray(reply.words) ? reply.words : [];
  const fromWords = words.length > 0 ? mergeWords(words, index) : [];
  let segments = fromWords;
  if (segments.length === 0 && Array.isArray(reply.segments)) segments = fromSegments(reply.segments, index);
  if (segments.length === 0 && reply.text?.trim()) {
    segments = [{ start: 0, end: 0, speaker: null, text: reply.text.trim() }];
  }

  const lastEnd = segments.reduce((max, segment) => Math.max(max, segment.end), 0);
  const reported = [reply.duration, reply.usage?.seconds].find(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0,
  );
  return {
    labels,
    doc: {
      version: 1,
      source: 'scribe',
      language: reply.language ?? null,
      durationSec: reported ?? (lastEnd > 0 ? lastEnd : fallbackDurationSec),
      speakers: labels.map((_, i) => defaultSpeakerName(i)),
      segments,
    },
  };
}
