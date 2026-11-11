/** One post, from whatever each feed format called its parts. Pure. */
import { parseFeedDate } from '@/services/feeds/dates';
import { attr, isNode, text } from '@/services/feeds/xml';
import { feedExcerpt } from '@/services/blogs/feed/excerpt';
import type { ParsedArticle } from '@/services/blogs/feed/types';
import { firstImage, htmlToText, summarize } from '@/services/blogs/feed/text';
import { decodeEntities } from '@/utils/html-entities';
import { resolveUrl } from '@/utils/urls';

export type RawArticle = {
  guid: string | null;
  link: string | null;
  title: string | null;
  author: string | null;
  /** The full post (`content:encoded`, Atom `content`), when the feed has it. */
  content: string | null;
  /** The short form (`description`, Atom `summary`). */
  description: string | null;
  /** A picture the feed names outright (media RSS, an image enclosure). */
  imageUrl: string | null;
  date: string | null;
};

/** A picture named by Media RSS: a thumbnail, or image content. */
export function mediaImage(item: Record<string, unknown>): string | null {
  const thumbnails = item['media:thumbnail'];
  const thumbnail = attr(thumbnails, 'url');
  if (thumbnail) return thumbnail;
  const group = isNode(item['media:group']) ? item['media:group'] : null;
  const contents = [item['media:content'], group?.['media:content']].flatMap((c) => (Array.isArray(c) ? c : c ? [c] : []));
  for (const content of contents) {
    const url = attr(content, 'url');
    const type = attr(content, 'type') ?? '';
    const medium = attr(content, 'medium') ?? '';
    if (url && (medium === 'image' || type.startsWith('image/'))) return url;
  }
  return null;
}

/**
 * The post, or null when it has no link: a post that cannot be opened on the
 * web cannot be read in full or told apart from its neighbours on the next
 * refresh.
 */
export function buildArticle(raw: RawArticle, base: string | null, now: Date): ParsedArticle | null {
  const link = raw.link ? resolveUrl(raw.link, base) : null;
  if (!link || !/^https?:/i.test(link)) return null;
  const body = raw.content ?? raw.description;
  const summarySource = raw.description && raw.description !== raw.content ? raw.description : body;
  const published = parseFeedDate(raw.date);
  const nowIso = now.toISOString();
  const imageUrl = raw.imageUrl ? resolveUrl(raw.imageUrl, link) : firstImage(body, link);

  return {
    guid: raw.guid,
    link,
    title: raw.title ? htmlToText(raw.title) || 'Untitled post' : 'Untitled post',
    author: raw.author ? decodeEntities(raw.author).trim() || null : null,
    contentHtml: body,
    excerpt: feedExcerpt(raw),
    summary: summarySource ? summarize(htmlToText(summarySource)) : null,
    imageUrl: imageUrl && /^https?:/i.test(imageUrl) ? imageUrl : null,
    publishedAt: published && published <= nowIso ? published : nowIso,
  };
}

/** An element's text, or an Atom-style `<name>` inside it. */
export function personName(value: unknown): string | null {
  if (Array.isArray(value)) return personName(value[0]);
  if (isNode(value) && 'name' in value) return text(value.name);
  return text(value);
}
