/**
 * A section's paragraphs as the sentences a cloud voice reads aloud, one
 * track each.
 *
 * Cut the way read-aloud cuts them (`splitSentences`), so a sentence the
 * audiobook made is the sentence the reader would ask for, and any sentence
 * over the maker's limit cut again (`cutPieces`) into parts that are tracks of
 * their own. Each keeps where it starts in its section's text, which is what
 * a highlight, a saved place and the follow-along sheet are all built from.
 *
 * Pure, so it can be tested on its own.
 */
import { CLOUD_VOICE_MAX_CHARACTERS } from 'samwell-shared';

import { cutPieces } from '@/services/cloud-tts/pieces';
import { splitSentences } from '@/services/cloud-tts/sentences';

/** A paragraph as the book-text index keeps it. */
export interface ScriptParagraph {
  section: number;
  /** Its number in the section, from 1. */
  n: number;
  /** Where it starts in the section's text. */
  start: number;
  text: string;
}

/** One track of the audiobook. */
export interface Sentence {
  /** `<section>:<paragraph n>:<i>`, stable for as long as the index version is. */
  id: string;
  section: number;
  paragraph: number;
  /** Where it starts in its section's text. */
  offset: number;
  text: string;
}

export function sentenceId(section: number, paragraph: number, i: number): string {
  return `${section}:${paragraph}:${i}`;
}

/** The section a sentence id belongs to, or null for one that is not an id. */
export function sectionOfId(id: string): number | null {
  const section = Number.parseInt(id.split(':')[0] ?? '', 10);
  return Number.isFinite(section) ? section : null;
}

/** Where `part` sits in `text` from `from` on: found, or the cursor itself if the cutters changed spacing. */
function locate(text: string, part: string, from: number): number {
  const at = text.indexOf(part, from);
  return at >= 0 ? at : from;
}

/** Every sentence of these paragraphs, in reading order. */
export function sentencesOf(paragraphs: readonly ScriptParagraph[], maxCharacters: number): Sentence[] {
  const out: Sentence[] = [];
  for (const paragraph of paragraphs) {
    let cursor = 0;
    let i = 0;
    for (const sentence of splitSentences(paragraph.text)) {
      const sentenceAt = locate(paragraph.text, sentence, cursor);
      let partCursor = sentenceAt;
      for (const part of cutPieces(sentence, maxCharacters)) {
        const at = locate(paragraph.text, part, partCursor);
        out.push({
          id: sentenceId(paragraph.section, paragraph.n, i),
          section: paragraph.section,
          paragraph: paragraph.n,
          offset: paragraph.start + at,
          text: part,
        });
        i += 1;
        partCursor = at + part.length;
      }
      cursor = Math.max(partCursor, sentenceAt + sentence.length);
    }
  }
  return out;
}

/**
 * A chapter as the audiobook reads it, cut at the cloud voices' common limit
 * so a sentence's id is the same whichever voice reads it (a maker with a
 * lower limit cuts its piece again without the id changing).
 */
export function scriptSentences(paragraphs: readonly ScriptParagraph[]): Sentence[] {
  return sentencesOf(paragraphs, CLOUD_VOICE_MAX_CHARACTERS);
}
