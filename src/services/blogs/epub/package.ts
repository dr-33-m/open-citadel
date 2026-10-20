/**
 * The files of a one-chapter EPUB 3 holding a blog post. Pure.
 *
 * The smallest package the reader opens: the `mimetype` marker, the container
 * pointing at the package document, the package document, the navigation
 * document EPUB 3 requires, and the post itself. No stylesheet of its own:
 * the reader's own settings (theme, font, size) set the type, as they do for
 * every book.
 *
 * The post opens with where it is from and closes with a link to the
 * original, so a highlight read later, or a chat started from it, always
 * leads back to the writer.
 */
import { EPUB_CONTAINER, epubModified, escapeAttribute, languageTag } from '@/services/epub/parts';

export type ArticleEpubInput = {
  /** Stable, so the same post always makes the same book identifier. */
  id: string;
  title: string;
  blogTitle: string;
  author: string | null;
  publishedAt: string;
  language: string | null;
  link: string;
  /** Strict XHTML, from `toXhtmlBody`. */
  bodyXhtml: string;
};

const DAY_MONTH_YEAR = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

const esc = escapeAttribute;

function byline(input: ArticleEpubInput): string {
  const date = new Date(input.publishedAt);
  return [input.author, Number.isNaN(date.getTime()) ? null : DAY_MONTH_YEAR.format(date)].filter(Boolean).join(' · ');
}

function hostName(link: string): string {
  return link.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0];
}

export function articleEpubFiles(input: ArticleEpubInput): Record<string, string> {
  const lang = languageTag(input.language);
  const identifier = `urn:open-citadel:article:${input.id}`;
  const modified = epubModified();
  const credit = byline(input);

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${lang}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${esc(identifier)}</dc:identifier>
    <dc:title>${esc(input.title)}</dc:title>
    <dc:creator>${esc(input.author ?? input.blogTitle)}</dc:creator>
    <dc:publisher>${esc(input.blogTitle)}</dc:publisher>
    <dc:language>${lang}</dc:language>
    <dc:source>${esc(input.link)}</dc:source>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="article" href="article.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="article"/>
  </spine>
</package>`;

  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head><title>${esc(input.title)}</title></head>
<body>
  <nav epub:type="toc" id="toc"><ol><li><a href="article.xhtml">${esc(input.title)}</a></li></ol></nav>
</body>
</html>`;

  const article = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head><title>${esc(input.title)}</title></head>
<body>
<p><small>${esc(input.blogTitle.toUpperCase())}</small></p>
<h1>${esc(input.title)}</h1>
${credit ? `<p><em>${esc(credit)}</em></p>\n` : ''}${input.bodyXhtml}
<hr/>
<p><small>Read the original on <a href="${esc(input.link)}">${esc(hostName(input.link))}</a></small></p>
</body>
</html>`;

  return {
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': EPUB_CONTAINER,
    'OEBPS/content.opf': opf,
    'OEBPS/nav.xhtml': nav,
    'OEBPS/article.xhtml': article,
  };
}
