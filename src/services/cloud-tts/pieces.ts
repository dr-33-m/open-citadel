/**
 * Cutting an utterance into pieces a maker will take.
 *
 * Readium hands over a sentence at a time, and nearly every sentence is far
 * under the 1,500 character limit, so nearly always this returns the text
 * whole. It matters for the sentence that runs on for a paragraph (old books
 * have them): that is cut at the last clause end before the limit, then the
 * last space, and only as a last resort mid-word, and the parts are read in
 * order as chunks of the one utterance so the highlight still covers it all.
 *
 * Pure, so it can be tested on its own.
 */

/** Where a clause ends: after these, a voice pauses anyway. */
const CLAUSE_END = /[.?!;:,—–)\]"”]\s/g;

export function cutPieces(text: string, maxCharacters: number): string[] {
  const limit = Math.max(1, Math.floor(maxCharacters));
  const pieces: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    const window = rest.slice(0, limit + 1);
    let cut = -1;
    for (const match of window.matchAll(CLAUSE_END)) {
      if (match.index !== undefined && match.index + 1 <= limit) cut = match.index + 1;
    }
    // A clause end in the first fifth would leave a tiny piece and then
    // another long one; a space nearer the limit reads better.
    if (cut < limit / 5) cut = window.lastIndexOf(' ', limit);
    if (cut <= 0) cut = limit;
    const piece = rest.slice(0, cut).trim();
    if (piece) pieces.push(piece);
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}
