/**
 * Sentences, for guessing what Readium will ask for next.
 *
 * Readium cuts a chapter into utterances (a sentence each) with its own
 * tokenizer, and never tells JS what is coming. It does hand over, with each
 * utterance, the rest of its paragraph (`locator.text.after`), and that is
 * enough to guess the next one or two if they are cut the way Readium cuts
 * them. A wrong guess costs real money (audio paid for and never played), so
 * the rule is the conservative one Readium's own tokenizer follows, after
 * Unicode's sentence rules (UAX 29): a break after `.`, `?` or `!`, and any
 * closing quotes or brackets, when whitespace follows and the next word does
 * not start in lower case. "Mr. Darcy" still breaks, as it does in Readium;
 * "e.g. this" does not. Hermes has no `Intl.Segmenter`, so it is written out.
 *
 * Pure, so it can be tested on its own.
 */

const TERMINAL = /[.?!…]/;
const CLOSING = /["'”’)\]»]/;

/** Lower case by the letter's own rules, without `\p{Ll}` (not every Hermes has it). */
function isLowerCase(char: string): boolean {
  return char !== char.toUpperCase() && char === char.toLowerCase();
}

/** Cut text into sentences, keeping each one's own punctuation. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    if (!TERMINAL.test(text[i])) {
      i++;
      continue;
    }
    let end = i + 1;
    while (end < text.length && (TERMINAL.test(text[end]) || CLOSING.test(text[end]))) end++;
    let next = end;
    while (next < text.length && /\s/.test(text[next])) next++;
    const breaks = next > end && (next >= text.length || !isLowerCase(text[next]));
    if (breaks || end >= text.length) {
      const sentence = text.slice(start, end).trim();
      if (sentence) out.push(sentence);
      start = next;
      i = next;
    } else {
      i = end;
    }
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/**
 * The same text however it was spaced or quoted, for matching a request to a
 * guess. Readium and this splitter can differ on a stray space or a curly
 * quote and still mean the same sentence; they must not differ on words.
 */
export function normaliseUtterance(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
