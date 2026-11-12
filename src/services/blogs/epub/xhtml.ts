/**
 * A post's HTML, made into XHTML the reader can open. Pure.
 *
 * The reader lays an EPUB chapter out as XHTML, and XHTML that is not
 * well-formed does not open at all. Blog HTML is anything but: unclosed tags,
 * bare ampersands, attributes without quotes. So the post is parsed with a
 * forgiving HTML parser and written back out as strict XHTML, keeping only
 * what reading needs: text and its structure, links, pictures and tables.
 * Scripts, styles, forms, embeds and tracking go.
 */
import { parseDocument } from 'htmlparser2';

import { escapeAttribute, escapeText } from '@/services/epub/parts';
import { resolveUrl } from '@/utils/urls';

export { escapeAttribute } from '@/services/epub/parts';

/** The parts of htmlparser2's DOM this reads, typed here rather than through its nested domhandler. */
type DomNode = {
  type: string;
  name?: string;
  data?: string;
  attribs?: Record<string, string>;
  children?: DomNode[];
};

/** Kept as they are. */
const KEEP = new Set([
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'em', 'strong', 'b', 'i', 'u',
  's', 'del', 'ins', 'sub', 'sup', 'small', 'mark', 'q', 'cite', 'abbr', 'kbd', 'a', 'ul', 'ol', 'li', 'dl', 'dt',
  'dd', 'figure', 'figcaption', 'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'span', 'div',
]);
/** Kept as a plain block: structure the reader has no use for, around text it does. */
const AS_DIV = new Set(['section', 'article', 'main', 'header', 'footer', 'aside', 'details', 'summary', 'center']);
/** Dropped with everything inside them. */
const DROP = new Set([
  'script', 'style', 'noscript', 'template', 'svg', 'math', 'form', 'input', 'button', 'select', 'textarea', 'nav',
  'object', 'embed', 'canvas', 'head', 'title', 'meta', 'link', 'iframe', 'video', 'audio', 'picture', 'source',
]);
const VOID = new Set(['br', 'hr', 'img']);
const ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'title'],
  img: ['src', 'alt', 'title'],
  ol: ['start'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  abbr: ['title'],
};

/** Characters XML forbids outright; one of them anywhere makes the chapter unreadable. */
function stripInvalid(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
}

/** An image's real address: lazy-loading sites put it in `data-src` or `srcset` and a placeholder in `src`. */
function imageSource(attribs: Record<string, string>): string | null {
  const candidates = [
    attribs['data-src'],
    attribs['data-lazy-src'],
    attribs['data-original'],
    attribs.src,
    (attribs.srcset ?? attribs['data-srcset'])?.split(',')[0]?.trim().split(/\s+/)[0],
  ];
  return candidates.find((c) => c && !c.startsWith('data:')) ?? null;
}

/** The tag's attributes as XHTML, or null when the element is not worth keeping (a picture with nowhere to load from). */
function cleanAttributes(name: string, attribs: Record<string, string>, base: string): string | null {
  if (name === 'img' && !imageSource(attribs)) return null;
  const out: string[] = [];
  for (const key of ATTRIBUTES[name] ?? []) {
    let value = key === 'src' ? imageSource(attribs) : attribs[key];
    if (value == null) continue;
    if (key === 'href' || key === 'src') {
      // In-page links (footnotes) stay in-page; everything else must be the web.
      if (key === 'href' && value.startsWith('#')) {
        out.push(`href="${escapeAttribute(value)}"`);
        continue;
      }
      const url = resolveUrl(value, base);
      if (!url || !/^https?:/i.test(url)) {
        if (key === 'src') return null;
        continue;
      }
      value = url;
    }
    if ((key === 'colspan' || key === 'rowspan' || key === 'start') && !/^\d+$/.test(value)) continue;
    out.push(`${key}="${escapeAttribute(stripInvalid(value))}"`);
  }
  // Ids carry footnote targets; kept when they are safe to write.
  const id = attribs.id;
  if (id && /^[A-Za-z][\w.:-]*$/.test(id)) out.push(`id="${id}"`);
  return out.join(' ');
}

function write(node: DomNode, base: string, out: string[]): void {
  if (node.type === 'text') {
    out.push(escapeText(stripInvalid(node.data ?? '')));
    return;
  }
  if (node.type === 'cdata') {
    for (const child of node.children ?? []) write(child, base, out);
    return;
  }
  if (node.type !== 'tag' && node.type !== 'root') return;
  const name = node.name?.toLowerCase() ?? '';
  if (node.type === 'tag' && DROP.has(name)) return;

  const kept = KEEP.has(name) ? name : AS_DIV.has(name) ? 'div' : null;
  if (!kept) {
    // Unknown wrappers (`font`, custom elements) give up their tag and keep their text.
    for (const child of node.children ?? []) write(child, base, out);
    return;
  }
  const attributes = cleanAttributes(kept, node.attribs ?? {}, base);
  if (attributes === null) return;
  const open = attributes ? `<${kept} ${attributes}` : `<${kept}`;
  if (VOID.has(kept)) {
    out.push(`${open}/>`);
    return;
  }
  out.push(`${open}>`);
  for (const child of node.children ?? []) write(child, base, out);
  out.push(`</${kept}>`);
}

/** The post's body as strict XHTML, links and pictures read against `base` (the post's address). */
export function toXhtmlBody(html: string, base: string): string {
  const document = parseDocument(html, { decodeEntities: true, lowerCaseTags: true }) as unknown as DomNode;
  const out: string[] = [];
  for (const child of document.children ?? []) write(child, base, out);
  return out.join('').replace(/(<br\/>\s*){3,}/g, '<br/><br/>').trim();
}
