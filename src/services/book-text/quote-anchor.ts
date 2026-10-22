/**
 * Finding a quoted passage in a section's text, and naming its section the
 * way the reader does. Pure: no database, no React Native.
 *
 * Samwell quotes "close to word-for-word", from a model's memory of a tool
 * result: curly quotes come back straight, an em dash as a hyphen, a skipped
 * stretch as an ellipsis, now and then a word changed. The reader draws a
 * highlight by finding its exact text on the page, so what is saved has to be
 * the book's own words at the book's own place, never the quote as typed.
 */

/** Where a passage sits in a section's joined text: `[start, end)`, and how sure the match is (1 is verbatim). */
export interface QuoteSpan {
  start: number;
  end: number;
  score: number;
}

/** A stretch skipped with an ellipsis spans no more than this. */
const MAX_ELLIPSIS_GAP = 3_000;
/** Below this many words a loose match is as likely to be the wrong passage as the right one. */
const MIN_FUZZY_WORDS = 5;
/** Share of the quote's words a loose match must hold, in a window its own length. */
const MIN_FUZZY_SCORE = 0.75;

const FOLD: Record<string, string> = {
  '‘': "'", '’': "'", '‚': "'", '′': "'",
  '“': '"', '”': '"', '„': '"', '″': '"',
  '–': '-', '—': '-', '―': '-', '−': '-',
  ' ': ' ', '…': '...',
};

/** Lowercased, punctuation folded, whitespace collapsed; with each folded character's place in the original. */
function normalize(text: string): { text: string; at: number[] } {
  let out = '';
  const at: number[] = [];
  let space = true;
  for (let i = 0; i < text.length; i++) {
    const folded = FOLD[text[i]] ?? text[i].toLowerCase();
    if (/\s/.test(folded)) {
      if (!space) {
        out += ' ';
        at.push(i);
      }
      space = true;
      continue;
    }
    for (const ch of folded) {
      out += ch;
      at.push(i);
    }
    space = false;
  }
  if (out.endsWith(' ')) {
    out = out.slice(0, -1);
    at.pop();
  }
  return { text: out, at };
}

/** The quote as it can be looked for: folded, and without the quotation marks or ellipses round it. */
function cleanQuote(quote: string): string {
  return normalize(quote).text.replace(/^["'.\s]+|["'.\s]+$/g, '');
}

function spanOf(at: readonly number[], from: number, to: number, score: number): QuoteSpan {
  return { start: at[from], end: at[to - 1] + 1, score };
}

/** The quote verbatim, or its pieces either side of an ellipsis in order and close together. */
function findExact(norm: { text: string; at: number[] }, quote: string): QuoteSpan | null {
  const whole = norm.text.indexOf(quote);
  if (whole >= 0) return spanOf(norm.at, whole, whole + quote.length, 1);

  const pieces = quote.split('...').map((piece) => piece.trim()).filter((piece) => piece.length > 0);
  if (pieces.length < 2) return null;
  let from = norm.text.indexOf(pieces[0]);
  while (from >= 0) {
    let cursor = from + pieces[0].length;
    let ok = true;
    for (const piece of pieces.slice(1)) {
      const next = norm.text.indexOf(piece, cursor);
      if (next < 0 || next - cursor > MAX_ELLIPSIS_GAP) {
        ok = false;
        break;
      }
      cursor = next + piece.length;
    }
    if (ok) return spanOf(norm.at, from, cursor, 1);
    from = norm.text.indexOf(pieces[0], from + 1);
  }
  return null;
}

const WORD = /[^\s.,;:!?"()[\]{}<>-]+/g;

function wordsOf(text: string): { word: string; start: number; end: number }[] {
  return [...text.matchAll(WORD)].map((m) => ({ word: m[0], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
}

/**
 * The window of the section, as many words long as the quote, holding the
 * most of the quote's words, trimmed to the first and last of them. One pass:
 * the window's count of shared words is kept as it slides.
 */
function findLoose(norm: { text: string; at: number[] }, quote: string): QuoteSpan | null {
  const wanted = wordsOf(quote).map((w) => w.word);
  if (wanted.length < MIN_FUZZY_WORDS) return null;
  const need = new Map<string, number>();
  for (const word of wanted) need.set(word, (need.get(word) ?? 0) + 1);

  const words = wordsOf(norm.text);
  const n = wanted.length;
  if (words.length < Math.ceil(n * MIN_FUZZY_SCORE)) return null;
  const held = new Map<string, number>();
  let shared = 0;
  const take = (word: string, by: 1 | -1) => {
    const limit = need.get(word) ?? 0;
    if (limit === 0) return;
    const before = held.get(word) ?? 0;
    const after = before + by;
    held.set(word, after);
    shared += Math.min(after, limit) - Math.min(before, limit);
  };

  let best = { shared: 0, from: 0 };
  for (let i = 0; i < words.length; i++) {
    take(words[i].word, 1);
    if (i >= n) take(words[i - n].word, -1);
    const from = Math.max(0, i - n + 1);
    if (shared > best.shared) best = { shared, from };
  }
  const score = best.shared / n;
  if (score < MIN_FUZZY_SCORE) return null;

  const window = words.slice(best.from, best.from + n);
  const first = window.findIndex((w) => need.has(w.word));
  const last = window.length - 1 - [...window].reverse().findIndex((w) => need.has(w.word));
  return spanOf(norm.at, window[first].start, window[last].end, score);
}

/**
 * Where a quote is in a section's text. `loose` also accepts a passage with
 * most of the quote's words in order-ish, for a quote with a word or two
 * changed; without it, only the verbatim text (folded) or its ellipsis pieces.
 */
export function findQuote(sectionText: string, quote: string, loose = false): QuoteSpan | null {
  const wanted = cleanQuote(quote);
  if (!wanted) return null;
  const norm = normalize(sectionText);
  return findExact(norm, wanted) ?? (loose ? findLoose(norm, wanted) : null);
}

/**
 * A section's spine path as the reader names it, worked out from a locator
 * the reader made (`template`) for a section whose spine path is known.
 * Readium names a resource relative to the package root, percent-encoded and
 * sometimes with a leading slash; the index keeps the decoded spine path. The
 * part the two disagree on is the prefix before the path they share.
 */
export function readerHref(spinePath: string, template: { href: string; spinePath: string } | null): string {
  const encoded = encodeURI(spinePath);
  if (!template) return encoded;
  const href = safeDecode(template.href.split('#')[0]);
  let shared = 0;
  while (
    shared < href.length &&
    shared < template.spinePath.length &&
    href[href.length - 1 - shared] === template.spinePath[template.spinePath.length - 1 - shared]
  ) {
    shared++;
  }
  const hrefPrefix = href.slice(0, href.length - shared);
  const spinePrefix = template.spinePath.slice(0, template.spinePath.length - shared);
  if (!spinePath.startsWith(spinePrefix)) return encoded;
  return encodeURI(hrefPrefix + spinePath.slice(spinePrefix.length));
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
