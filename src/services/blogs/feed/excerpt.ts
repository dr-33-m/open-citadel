/**
 * Whether a feed carries a post whole or only its opening. Pure.
 *
 * A publisher who syndicates only the first lines of each post has chosen to
 * be read on its own site, and the app keeps to that unless the reader asks
 * for the whole post (`article-route.ts`). So this has to tell a summary from
 * a short post, and length alone cannot: Seth Godin and Derek Sivers write
 * complete posts of a few hundred characters, and a magazine's summary is
 * the same size. What tells them apart is what the feed itself says:
 *
 * - a post that ends on "…" or "Continue reading" is cut, whatever its length;
 * - a feed with only a `description` (no `content:encoded`, no Atom
 *   `content`) is a summary when it is short;
 * - a body that is only its summary over again is a summary too (Public
 *   Domain Review puts the one-line blurb in both).
 *
 * Measured on the 45 blogs in Explore (2026-11-11): every summary-only feed
 * is caught, and the short-post blogs the old length rule flagged are not.
 */
import { htmlToText } from '@/services/blogs/feed/text';

/** Under this much text, a copy with no sign of being whole is taken for a summary. */
export const TEASER_CHARS = 1200;
const CUT_ENDING = /(…|\.\.\.|\[…\]|continue reading|read more|read the rest)[\s\S]{0,40}$/i;

/** A post as a feed carries it: its body, and its short form. */
export type FeedCopy = { content: string | null; description: string | null };

/** Whether the feed carries only the opening of this post. */
export function feedExcerpt({ content, description }: FeedCopy): boolean {
  const body = content ?? description;
  if (!body) return true;
  const text = htmlToText(body);
  if (CUT_ENDING.test(text)) return true;
  if (text.length >= TEASER_CHARS) return false;
  if (!content) return true;
  return description != null && htmlToText(description) === text;
}

/**
 * For a post stored before `feedExcerpt` was asked, which a refresh no longer
 * reaches (the feed has moved past it): what the blog's newer posts say, when
 * they agree, since a blog syndicates all its posts one way. Seth Godin's
 * short posts are whole because his feed carries every post whole. Only when
 * nothing is known, or the blog is mixed, the copy's own length (`isTeaser`).
 */
export function storedExcerpt(known: readonly boolean[], contentHtml: string | null): boolean {
  if (known.length > 0 && known.every((excerpt) => !excerpt)) return false;
  if (known.length > 0 && known.every((excerpt) => excerpt)) return true;
  return isTeaser(contentHtml);
}

/**
 * The old guess, from the stored copy alone: short or cut off. It takes
 * short posts for summaries, so it is the last resort (`storedExcerpt`).
 */
export function isTeaser(contentHtml: string | null): boolean {
  if (!contentHtml) return true;
  const text = htmlToText(contentHtml);
  return text.length < TEASER_CHARS || CUT_ENDING.test(text);
}
