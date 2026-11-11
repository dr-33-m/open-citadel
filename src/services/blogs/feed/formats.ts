/** RSS 2.0, RSS 1.0 (RDF) and Atom, read into one shape. Pure. */
import { attr, firstLink, isNode, text, type Node } from '@/services/feeds/xml';
import { buildArticle, mediaImage, personName } from '@/services/blogs/feed/article';
import { htmlToText } from '@/services/blogs/feed/text';
import type { ParsedArticle, ParsedBlog } from '@/services/blogs/feed/types';
import { decodeEntities } from '@/utils/html-entities';
import { resolveUrl } from '@/utils/urls';

function nodes(value: unknown): Node[] {
  return (Array.isArray(value) ? value : value ? [value] : []).filter(isNode);
}

/** A copyright line as one short line of plain text, or null. Long ones are licences pasted whole, not a notice. */
function plainRights(value: string | null): string | null {
  const line = value ? htmlToText(value).replace(/\s+/g, ' ').trim() : '';
  return line && line.length <= 200 ? line : null;
}

function imageEnclosure(item: Node): string | null {
  const enclosure = nodes(item.enclosure).find((e) => (attr(e, 'type') ?? '').startsWith('image/'));
  return attr(enclosure, 'url');
}

function collect(items: Node[], read: (item: Node) => ParsedArticle | null): ParsedArticle[] {
  const seen = new Set<string>();
  const out: ParsedArticle[] = [];
  for (const item of items) {
    const article = read(item);
    if (!article || seen.has(article.link)) continue;
    seen.add(article.link);
    out.push(article);
  }
  return out;
}

/** RSS 2.0, and RSS 1.0 whose items sit beside the channel rather than in it. */
export function parseRssLike(channel: Node, items: Node[], type: 'rss' | 'rdf', feedUrl: string | null, now: Date): ParsedBlog {
  const siteUrl = firstLink(channel.link);
  const base = siteUrl ?? feedUrl;
  const image = isNode(channel.image) ? text(channel.image.url) : attr(channel.image, 'rdf:resource');
  return {
    type,
    title: text(channel.title) ?? 'Untitled blog',
    siteUrl: siteUrl ? resolveUrl(siteUrl, feedUrl) : null,
    description: text(channel.description),
    imageUrl: image ? resolveUrl(image, base) : null,
    language: text(channel.language) ?? text(channel['dc:language']),
    rights: plainRights(text(channel.copyright) ?? text(channel['dc:rights'])),
    articles: collect(items, (item) =>
      buildArticle(
        {
          guid: text(item.guid) ?? attr(item, 'rdf:about'),
          link: firstLink(item.link) ?? (attr(item.guid, 'isPermaLink') !== 'false' ? text(item.guid) : null),
          title: text(item.title),
          author: text(item['dc:creator']) ?? text(item.author),
          content: text(item['content:encoded']),
          description: text(item.description),
          imageUrl: mediaImage(item) ?? imageEnclosure(item),
          date: text(item.pubDate) ?? text(item['dc:date']),
        },
        base,
        now,
      ),
    ),
  };
}

function atomLink(links: unknown, rel: string): string | null {
  const found = nodes(links).find((l) => (attr(l, 'rel') ?? 'alternate') === rel && attr(l, 'href'));
  return attr(found, 'href');
}

/**
 * An Atom text construct, which the parser leaves raw: `xhtml` is markup
 * already (inside a wrapping div), `html` is markup escaped once, and plain
 * `text` is escaped text. CDATA is unwrapped either way.
 */
export function atomText(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const type = attr(value, 'type') ?? 'text';
  const unwrapped = raw.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
  if (unwrapped !== raw) return unwrapped.trim() || null;
  if (type === 'xhtml') return raw.replace(/^\s*<div\b[^>]*>([\s\S]*)<\/div>\s*$/i, '$1').trim() || null;
  return decodeEntities(raw).trim() || null;
}

export function parseAtom(feed: Node, feedUrl: string | null, now: Date): ParsedBlog {
  const siteLink = atomLink(feed.link, 'alternate');
  const siteUrl = siteLink ? resolveUrl(siteLink, feedUrl) : null;
  const feedAuthor = personName(feed.author);
  const logo = text(feed.logo) ?? text(feed.icon);
  return {
    type: 'atom',
    title: text(feed.title) ?? 'Untitled blog',
    siteUrl,
    description: text(feed.subtitle),
    imageUrl: logo ? resolveUrl(logo, siteUrl ?? feedUrl) : null,
    language: attr(feed, 'xml:lang'),
    rights: plainRights(atomText(feed.rights)),
    articles: collect(nodes(feed.entry), (entry) => {
      const link = atomLink(entry.link, 'alternate');
      const enclosure = nodes(entry.link).find(
        (l) => attr(l, 'rel') === 'enclosure' && (attr(l, 'type') ?? '').startsWith('image/'),
      );
      return buildArticle(
        {
          guid: text(entry.id),
          link,
          title: text(entry.title),
          author: personName(entry.author) ?? feedAuthor,
          content: atomText(entry.content),
          description: atomText(entry.summary),
          imageUrl: mediaImage(entry) ?? attr(enclosure, 'href'),
          date: text(entry.published) ?? text(entry.updated),
        },
        siteUrl ?? feedUrl,
        now,
      );
    }),
  };
}
