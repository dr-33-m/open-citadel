/** Fewer characters than this say too little to be found by. */
const MIN_PROBE = 12;
/** How much of the snippet is looked for: enough to be unique, short enough to survive a stray difference later on. */
const PROBE = 60;

type Flat = { flat: string; from: number[] };

/**
 * `text` without its whitespace and soft hyphens, and where each kept
 * character came from. Whitespace goes entirely rather than being collapsed:
 * the page's text is its text nodes run together, so two paragraphs can meet
 * with no space between them where the chapter's own has a blank line.
 */
function normalise(text: string): Flat {
  let flat = '';
  const from: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '­' || /\s/.test(ch)) continue;
    flat += ch;
    from.push(i);
  }
  return { flat, from };
}

/** The chapter last flattened: it is asked about again on every sentence while the pages are off the voice. */
let last: { text: string; flat: Flat } | null = null;

function flatChapter(text: string): Flat {
  if (last?.text !== text) last = { text, flat: normalise(text) };
  return last.flat;
}

/**
 * Where `snippet` (text read off the page) begins in `text` (the chapter's
 * own), or null when it is not there. Whitespace and soft hyphens are not
 * held against it, since a page lays them out its own way. Of several places
 * it occurs, the one nearest `near` (an estimate of where to look).
 */
export function offsetOfText(text: string, snippet: string, near: number): number | null {
  const page = normalise(snippet).flat;
  if (page.length < MIN_PROBE) return null;
  const probe = page.slice(0, PROBE);
  const { flat, from } = flatChapter(text);
  let best: number | null = null;
  for (let at = flat.indexOf(probe); at >= 0; at = flat.indexOf(probe, at + 1)) {
    const offset = from[at];
    if (best === null || Math.abs(offset - near) < Math.abs(best - near)) best = offset;
  }
  return best;
}
