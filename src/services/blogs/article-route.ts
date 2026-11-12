/**
 * How a post opens. Pure.
 *
 * The rule, so the publisher's choice and the reader's are both kept:
 *
 * - A feed that carries the whole post is read in the app, as any feed
 *   reader shows what a feed syndicates.
 * - A feed that carries only the opening has chosen to be read on its site.
 *   The app asks the reader once per blog (`WholePosts`): read it there, or
 *   fetch each post they open into the reader, as a browser's reader view
 *   would. Never fetched on the app's own initiative, and never where the
 *   publisher has said no (`PublisherPermissions.wholePosts`).
 * - A chat about such a post, when the whole post is not to be fetched, is
 *   about its opening: Samwell is told that is all there is.
 * - A copy already on the phone is used, unless it is only the opening and
 *   the reader has since asked for whole posts.
 */
import type { WholePosts } from '@/db/schema';

export type ArticleRoute =
  /** The copy already on the phone. */
  | 'copy'
  /** Write the feed's copy, which is the whole post. */
  | 'feed'
  /** Fetch the post's page for the whole of it. */
  | 'page'
  /** Write the feed's opening, all a chat can have without fetching. */
  | 'opening'
  /** Open it on the publisher's site. */
  | 'site'
  /** Ask the reader how this blog is read, then decide again. */
  | 'ask';

export type ArticleRouteInput = {
  /** Reading it (or listening), or starting a chat about it. */
  purpose: 'read' | 'chat';
  /** The feed carries only its opening. */
  excerpt: boolean;
  /** The copy on the phone, if any. */
  copy: 'whole' | 'opening' | null;
  wholePosts: WholePosts | null;
  /** The publisher has not asked that its pages not be fetched. */
  allowed: boolean;
};

export function articleRoute({ purpose, excerpt, copy, wholePosts, allowed }: ArticleRouteInput): ArticleRoute {
  if (copy === 'whole') return 'copy';
  if (!excerpt) return 'feed';
  if (allowed && wholePosts === 'app') return 'page';
  if (purpose === 'chat') return copy ? 'copy' : 'opening';
  if (!allowed || wholePosts === 'site') return 'site';
  return 'ask';
}
