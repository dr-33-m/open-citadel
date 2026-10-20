/**
 * A podcast transcript as the files of an EPUB 3. Pure.
 *
 * The blog posts' trick again (`services/blogs/epub/package.ts`): once an
 * episode is a book, Samwell's search, chapters, highlights, Timeline and
 * Compass all reach it with no code of their own.
 *
 * The chapters are the episode's own when it has them, otherwise fifteen
 * minute parts named by their times ("0:00 to 15:00"), so `read_chapter`
 * moves through an interview the way it moves through a book. Each segment
 * is a paragraph that opens with its speaker and time ("Lex Fridman · 12:04")
 * so Samwell's search sees who said a thing and when, and carries its own id
 * (`s123`) so a transcript row can later be turned into a reader locator
 * without rewriting the file.
 */
import type { TranscriptDoc } from 'samwell-shared';

import { EPUB_CONTAINER, epubModified, escapeAttribute, escapeText, languageTag } from '@/services/epub/parts';
import { formatClock } from '@/utils/clock';

export const PART_SECONDS = 15 * 60;

export type EpisodeEpubInput = {
  /** Stable, so the same episode always makes the same book identifier. */
  episodeId: string;
  title: string;
  showTitle: string;
  pubDate: string | null;
  link: string | null;
  doc: TranscriptDoc;
  chapters: { startSec: number; title: string }[];
};

export type EpisodePart = { title: string; startSec: number; segments: number[] };

/** Characters XML forbids outright; one anywhere makes the chapter unreadable. */
const clean = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');

/** The segments grouped into the episode's chapters, or into fifteen minute parts. */
export function episodeParts(doc: TranscriptDoc, chapters: EpisodeEpubInput['chapters']): EpisodePart[] {
  const timed = doc.segments.some((segment) => segment.end > 0);
  if (!timed || doc.segments.length === 0) {
    return [{ title: 'Transcript', startSec: 0, segments: doc.segments.map((_, i) => i) }];
  }
  const starts =
    chapters.length > 0
      ? [...chapters].sort((a, b) => a.startSec - b.startSec).map((c) => ({ title: c.title, startSec: c.startSec }))
      : Array.from({ length: Math.max(1, Math.ceil(doc.durationSec / PART_SECONDS)) }, (_, i) => ({
          title: `${formatClock(i * PART_SECONDS)} to ${formatClock(Math.min(doc.durationSec, (i + 1) * PART_SECONDS))}`,
          startSec: i * PART_SECONDS,
        }));
  // Anything before the first chapter belongs to it.
  starts[0] = { ...starts[0], startSec: 0 };
  const parts: EpisodePart[] = starts.map((start) => ({ ...start, segments: [] }));
  let at = 0;
  doc.segments.forEach((segment, i) => {
    while (at + 1 < parts.length && segment.start >= parts[at + 1].startSec) at += 1;
    parts[at].segments.push(i);
  });
  return parts.filter((part) => part.segments.length > 0);
}

/** "Lex Fridman · 12:04", "12:04", or the name alone for an untimed transcript. */
export function segmentLabel(doc: TranscriptDoc, index: number): string {
  const segment = doc.segments[index];
  const name = segment.speaker != null ? doc.speakers[segment.speaker] : null;
  const time = segment.end > 0 || segment.start > 0 ? formatClock(segment.start) : null;
  return [name, time].filter(Boolean).join(' · ');
}

function chapterXhtml(input: EpisodeEpubInput, part: EpisodePart, lang: string, first: boolean): string {
  const paragraphs = part.segments
    .map((i) => {
      const label = segmentLabel(input.doc, i);
      const words = escapeText(clean(input.doc.segments[i].text));
      return `<p id="s${i}">${label ? `<strong>${escapeText(clean(label))}</strong> ` : ''}${words}</p>`;
    })
    .join('\n');
  const opening = first
    ? `<p><small>${escapeText(clean(input.showTitle.toUpperCase()))}</small></p>\n<h1>${escapeText(clean(input.title))}</h1>\n`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head><title>${escapeText(clean(part.title))}</title></head>
<body>
${opening}<h2>${escapeText(clean(part.title))}</h2>
${paragraphs}
</body>
</html>`;
}

/** A part's file inside `OEBPS/`; with that prefix, the `href` Readium gives a place in it. */
export const partFile = (i: number) => `part${i + 1}.xhtml`;

export function episodeEpubFiles(input: EpisodeEpubInput): Record<string, string> {
  const lang = languageTag(input.doc.language);
  const parts = episodeParts(input.doc, input.chapters);
  const esc = (value: string) => escapeAttribute(clean(value));
  const file = partFile;

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${lang}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${esc(`urn:open-citadel:episode:${input.episodeId}`)}</dc:identifier>
    <dc:title>${esc(input.title)}</dc:title>
    <dc:creator>${esc(input.showTitle)}</dc:creator>
    <dc:publisher>${esc(input.showTitle)}</dc:publisher>
    <dc:language>${lang}</dc:language>
${input.link ? `    <dc:source>${esc(input.link)}</dc:source>\n` : ''}    <meta property="dcterms:modified">${epubModified()}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${parts.map((_, i) => `    <item id="part${i + 1}" href="${file(i)}" media-type="application/xhtml+xml"/>`).join('\n')}
  </manifest>
  <spine>
${parts.map((_, i) => `    <itemref idref="part${i + 1}"/>`).join('\n')}
  </spine>
</package>`;

  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head><title>${esc(input.title)}</title></head>
<body>
  <nav epub:type="toc" id="toc"><ol>
${parts.map((part, i) => `    <li><a href="${file(i)}">${esc(part.title)}</a></li>`).join('\n')}
  </ol></nav>
</body>
</html>`;

  const files: Record<string, string> = {
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': EPUB_CONTAINER,
    'OEBPS/content.opf': opf,
    'OEBPS/nav.xhtml': nav,
  };
  parts.forEach((part, i) => {
    files[`OEBPS/${file(i)}`] = chapterXhtml(input, part, lang, i === 0);
  });
  return files;
}
