/**
 * Keeps the highlight and thought cards in a reply pointing at real entries.
 *
 * A small on-device model copies a marker's id unevenly. Gemma 4 E2B wrote
 * `hl-12790165383809-56n8e8` for `hl-1790165338809-56n8e8`: the card found
 * nothing and drew nothing, leaving a hole in the sentence. It also quotes a
 * highlight back without its marker at all. Both are mended here against the
 * entries the chat's own tool results named, so this can only ever point a
 * card at something Samwell was actually shown.
 */

export type RefType = 'highlight' | 'thought';

export interface KnownRef {
  type: RefType;
  id: string;
  /** The entry's text as the tool gave it, for spotting a quote of it. */
  text: string;
}

const REF_MARKER = /\[\[ref:(highlight|thought):([^\]]+)\]\]/g;
/** A search result's first line: its number and its quoted text. */
const QUOTED = /^\d+\. "([\s\S]*)"\n/;

/** Most cards to add for quotes the model left without a marker. */
const MAX_RECOVERED = 3;
/** Share of an entry's words a reply has to repeat to count as quoting it. */
const QUOTE_OVERLAP = 0.7;
/** Entries shorter than this, in words, match too much ordinary prose. */
const MIN_QUOTE_WORDS = 6;

const marker = (ref: Pick<KnownRef, 'type' | 'id'>) => `[[ref:${ref.type}:${ref.id}]]`;

/** Every entry the tool results name with a `Ref:` line, once each. */
export function refsInToolResults(results: readonly string[]): KnownRef[] {
  const refs = new Map<string, KnownRef>();
  for (const result of results) {
    for (const block of result.split('\n\n')) {
      const ref = [...block.matchAll(REF_MARKER)][0];
      if (!ref || refs.has(ref[2])) continue;
      refs.set(ref[2], { type: ref[1] as RefType, id: ref[2], text: QUOTED.exec(block)?.[1] ?? '' });
    }
  }
  return [...refs.values()];
}

function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length];
}

/** The known entry an id was plainly meant to be, if one is close enough to say. */
function meantRef(type: string, id: string, refs: readonly KnownRef[]): KnownRef | undefined {
  let best: { ref: KnownRef; distance: number } | undefined;
  for (const ref of refs) {
    if (ref.type !== type) continue;
    const distance = editDistance(id, ref.id);
    if (!best || distance < best.distance) best = { ref, distance };
  }
  // A few digits dropped, doubled or swapped, not a different id altogether.
  return best && best.distance <= Math.floor(best.ref.id.length * 0.4) ? best.ref : undefined;
}

function wordsOf(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
}

function quotes(reply: Set<string>, entry: KnownRef): boolean {
  const words = wordsOf(entry.text);
  if (words.size < MIN_QUOTE_WORDS) return false;
  let shared = 0;
  for (const word of words) if (reply.has(word)) shared++;
  return shared / words.size >= QUOTE_OVERLAP;
}

/**
 * `reply` with each mistyped marker pointed at the entry it meant, and a card
 * added for each known entry it quotes without one. A marker that matches
 * nothing known is left alone: it may name an entry from elsewhere, and the
 * card resolves it or not on its own.
 */
export function repairRefMarkers(reply: string, refs: readonly KnownRef[]): string {
  if (refs.length === 0 || !reply.trim()) return reply;

  const ids = new Set(refs.map((r) => r.id));
  const mended = reply.replace(REF_MARKER, (whole, type: string, id: string) => {
    if (ids.has(id)) return whole;
    const meant = meantRef(type, id, refs);
    return meant ? marker(meant) : whole;
  });

  const words = wordsOf(mended);
  const missing = refs
    .filter((r) => !mended.includes(marker(r)) && quotes(words, r))
    .slice(0, MAX_RECOVERED);
  if (missing.length === 0) return mended;

  // Appended rather than spliced in beside the quote, as book cards are.
  return `${mended.trimEnd()}\n\n${missing.map(marker).join('\n')}`;
}
