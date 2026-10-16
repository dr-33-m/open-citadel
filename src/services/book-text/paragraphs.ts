import { decodeEntities } from '@/utils/html-entities';

/** Elements that end one paragraph and begin the next. */
const BLOCK = /<\/?(p|div|h[1-6]|li|ul|ol|blockquote|section|article|aside|header|footer|figure|figcaption|table|tr|pre|dd|dt|dl|hr)\b[^>]*>/gi;
/** Past this, a "paragraph" is a book with no block markup, cut into readable pieces. */
const LONGEST_PARAGRAPH = 1_600;

/** Whitespace in one paragraph, collapsed. */
const squeeze = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Text with every tag and entity gone, on one line. */
export function plainText(html: string): string {
  return squeeze(decodeEntities(html.replace(/<[^>]+>/g, ' ')));
}

/** A run of text with no paragraphs in it, cut at sentence ends into pieces no longer than the cap. */
function splitLong(text: string): string[] {
  if (text.length <= LONGEST_PARAGRAPH) return [text];
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > LONGEST_PARAGRAPH) {
    const window = rest.slice(0, LONGEST_PARAGRAPH);
    const sentenceEnd = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
    const cut = sentenceEnd > LONGEST_PARAGRAPH / 2 ? sentenceEnd + 1 : (window.lastIndexOf(' ') > 0 ? window.lastIndexOf(' ') : LONGEST_PARAGRAPH);
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

/**
 * A chapter's XHTML as its paragraphs, in order: what Samwell numbers, cites
 * and reads from. Each block element (a paragraph, a heading, a list item, a
 * quotation) is one paragraph; a line break inside one is a space. Scripts,
 * styles and the document head say nothing a reader sees, so they are gone.
 */
export function htmlToParagraphs(html: string): string[] {
  const body = html
    .replace(/<head[\s\S]*?<\/head>/i, ' ')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(BLOCK, '\n\n')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(body)
    .split(/\n\s*\n/)
    .map(squeeze)
    .filter((paragraph) => paragraph.length > 0)
    .flatMap(splitLong);
}

/**
 * A section's own heading, for saying where a passage came from: the
 * document `<title>` first, which is what a reader sees in the contents, and
 * a leading `<h1>`/`<h2>` for books that leave the title generic.
 */
export function sectionTitle(html: string): string | null {
  const heading = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i)?.[1];
  if (!heading) return null;
  const text = plainText(heading);
  return text.length > 0 && text.length <= 120 ? text : null;
}
