/** Fewer characters than this say too little to be found by. */
const MIN_PROBE = 12;
/** How much of the snippet is looked for: enough to be unique, short enough to survive a stray difference later on. */
const PROBE = 60;

/** `text` with each run of whitespace one space and soft hyphens gone, and where each kept character came from. */
function normalise(text: string): { flat: string; from: number[] } {
  let flat = '';
  const from: number[] = [];
  let space = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '­') continue;
    if (/\s/.test(ch)) {
      if (!space && flat.length > 0) {
        flat += ' ';
        from.push(i);
      }
      space = true;
      continue;
    }
    space = false;
    flat += ch;
    from.push(i);
  }
  return { flat, from };
}

/**
 * Where `snippet` (text read off the page) begins in `text` (the chapter's
 * own), or null when it is not there. Whitespace and soft hyphens are not
 * held against it, since a page lays them out its own way. Of several places
 * it occurs, the one nearest `near` (an estimate of where to look).
 */
export function offsetOfText(text: string, snippet: string, near: number): number | null {
  const page = normalise(snippet).flat.trim();
  if (page.length < MIN_PROBE) return null;
  const probe = page.slice(0, PROBE);
  const { flat, from } = normalise(text);
  let best: number | null = null;
  for (let at = flat.indexOf(probe); at >= 0; at = flat.indexOf(probe, at + 1)) {
    const offset = from[at];
    if (best === null || Math.abs(offset - near) < Math.abs(best - near)) best = offset;
  }
  return best;
}
