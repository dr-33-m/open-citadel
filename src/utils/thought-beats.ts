/** One stretch of a thought: what it was about, when the trace names it, and what he worked through. */
export interface ThoughtBeat {
  title: string | null;
  body: string;
}

/** A line that is only a heading: `**Planning the search**` or `### Planning the search`. */
const HEADING = /^(?:\*\*(.+?)\*\*|#{1,6}\s+(.+?))\s*:?\s*$/;

/**
 * A reasoning trace as beats, a paragraph to each, so it reads as a sequence
 * rather than one block. Some brains head each stretch in bold (OpenAI and
 * Gemini summaries); others write plain paragraphs (Claude). A heading becomes
 * its beat's title; one standing alone on its paragraph heads the next.
 * Leftover bold marks inside a paragraph are dropped, since nothing here
 * draws markdown.
 */
export function thoughtBeats(text: string): ThoughtBeat[] {
  const beats: ThoughtBeat[] = [];
  let pendingTitle: string | null = null;
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.trim().split('\n');
    const first = lines[0]?.trim() ?? '';
    const heading = HEADING.exec(first);
    const title = heading ? (heading[1] ?? heading[2] ?? '').trim() : null;
    const body = (title ? lines.slice(1) : lines)
      .join(' ')
      .replace(/\*\*|__/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (title && !body) {
      pendingTitle = title;
      continue;
    }
    if (!body) continue;
    beats.push({ title: title ?? pendingTitle, body });
    pendingTitle = null;
  }
  if (pendingTitle) beats.push({ title: pendingTitle, body: '' });
  return beats;
}
