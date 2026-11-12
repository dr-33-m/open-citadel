/**
 * HTML and plain-text transcripts. Pure.
 *
 * HTML comes in two kinds. Buzzsprout's is timed: a `<cite>` speaker, a
 * `<time>` and a paragraph of `<span data-t>` words. Most others are
 * paragraphs with a "Name:" habit and no clock at all. Plain text is the
 * second kind without the tags. Untimed transcripts are read, searched and
 * talked about like any other; they just cannot follow the audio.
 */
import { parseDocument } from 'htmlparser2';
import type { TranscriptDoc } from 'samwell-shared';

import {
  docFromPieces,
  parseClock,
  plainText,
  speakerPrefixes,
  splitPrefix,
  type Piece,
} from '@/services/podcasts/transcript/cues';

type DomNode = { type: string; name?: string; data?: string; attribs?: Record<string, string>; children?: DomNode[] };

const BLOCKS = new Set(['p', 'div', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr']);

function textOf(node: DomNode): string {
  if (node.type === 'text') return node.data ?? '';
  return (node.children ?? []).map(textOf).join(' ');
}

/** Paragraphs as plain lines, "Name:" openings split off when the file keeps using them. */
function fromLines(lines: string[]): Piece[] {
  const known = speakerPrefixes(lines);
  return lines.map((line) => ({ start: 0, end: 0, ...splitPrefix(line, known) }));
}

export function parseHtmlTranscript(body: string): TranscriptDoc | null {
  const root = parseDocument(body, { decodeEntities: true }) as unknown as DomNode;
  const pieces: Piece[] = [];
  const lines: string[] = [];
  let speaker: string | null = null;
  let at: number | null = null;

  const walk = (node: DomNode) => {
    if (node.type === 'script' || node.type === 'style') return;
    const name = node.name?.toLowerCase();
    if (name === 'cite') {
      speaker = plainText(textOf(node)) || null;
      return;
    }
    if (name === 'time') {
      at = parseClock(textOf(node));
      return;
    }
    if (name === 'span' && node.attribs?.['data-t'] != null) {
      const start = Number(node.attribs['data-t']);
      if (Number.isFinite(start)) pieces.push({ start, end: start, speaker, text: plainText(textOf(node)) });
      return;
    }
    if (name && BLOCKS.has(name) && !(node.children ?? []).some((child) => child.name && BLOCKS.has(child.name))) {
      const timedWords = (node.children ?? []).some((child) => child.attribs?.['data-t'] != null);
      if (!timedWords) {
        const line = plainText(textOf(node));
        if (line && at != null) pieces.push({ start: at, end: at, speaker, text: line });
        else if (line) lines.push(line);
        return;
      }
    }
    (node.children ?? []).forEach(walk);
  };
  walk(root);

  // Each timed word ends where the next begins.
  for (let i = 0; i < pieces.length - 1; i++) pieces[i].end = Math.max(pieces[i].start, pieces[i + 1].start);
  const doc = docFromPieces(pieces.length > 0 ? pieces : fromLines(lines));
  return doc.segments.length > 0 ? doc : null;
}

export function parsePlainTranscript(body: string): TranscriptDoc | null {
  const lines = body.replace(/\r\n?/g, '\n').split(/\n\s*\n|\n(?=[A-Z][\w .'’-]{0,40}?:\s)/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const doc = docFromPieces(fromLines(lines));
  return doc.segments.length > 0 ? doc : null;
}
