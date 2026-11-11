import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';

import { ExternalLink } from '@/components/icons';
import { dismissToast, showToast } from '@/components/toast/toast-provider';
import { invalidateBlogLibrary } from '@/query-manager/blogs';
import { openArticle as routeArticle, type ArticleOpen, type WholePostsAsk } from '@/services/blogs/article-book';
import type { ArticleItem } from '@/services/blogs/records';
import { askSamwellAbout } from '@/services/samwell-handoff';
import { hostOf } from '@/utils/urls';

const TOAST_KEY = 'open-article';
/** Opening usually takes a moment; a toast only for a wait long enough to notice. */
const BUSY_AFTER_MS = 400;

export type OpenablePost = Pick<ArticleItem, 'id' | 'title' | 'link'>;

/** What the reader was doing when asked how a blog is read, to carry on with once they answer. */
export type ArticleIntent = 'open' | 'listen';

/** Puts the "how is this blog read" question up (`useWholePosts`). */
export type AskWholePosts = (ask: { blog: WholePostsAsk; post: OpenablePost; intent: ArticleIntent }) => void;

/** Only one post opens at a time: a second tap while one is getting ready does nothing. */
let opening = false;

/**
 * Runs `work` for a post, saying so in a toast if it takes long enough to
 * notice, and offering the original on the web if it fails.
 */
async function withPost<T>(post: OpenablePost, work: () => Promise<T>): Promise<T | null> {
  if (opening) return null;
  opening = true;
  const busy = setTimeout(() => showToast({ key: TOAST_KEY, message: 'Getting the post ready', busy: true }), BUSY_AFTER_MS);
  try {
    const result = await work();
    dismissToast(TOAST_KEY);
    // Opening marks the post read; the list learns of it on the way back
    // (`useArticleActions`), not on the frame the reader starts to slide in.
    return result;
  } catch (err) {
    // A failure after the post's copy was made still changed it.
    invalidateBlogLibrary();
    showToast({
      key: TOAST_KEY,
      message: err instanceof Error ? err.message : 'This post could not be opened.',
      actionIcon: ExternalLink,
      actionLabel: 'Open the original',
      onActionPress: () => void WebBrowser.openBrowserAsync(post.link).catch(() => {}),
    });
    return null;
  } finally {
    clearTimeout(busy);
    opening = false;
  }
}

type ToSite = Extract<ArticleOpen, { to: 'site' }>;

/** On the publisher's site, saying why when it is not what the reader chose. */
function openOnSite({ link, reason }: ToSite): void {
  if (reason) showToast({ key: TOAST_KEY, message: reason });
  // Opening it there marked it read.
  invalidateBlogLibrary();
  void WebBrowser.openBrowserAsync(link).catch(() => {});
}

/** Listen was pressed on a post read on its site: nothing to hear here, and the browser only if asked. */
function cannotListen({ link, reason }: ToSite): void {
  showToast({
    key: TOAST_KEY,
    message: reason ?? `Posts from ${hostOf(link) ?? 'this blog'} are read on its site, so this one can't be heard here.`,
    actionIcon: ExternalLink,
    actionLabel: 'Open the original',
    onActionPress: () => void WebBrowser.openBrowserAsync(link).catch(() => {}),
  });
}

/**
 * Opening a post, listening to one and starting a chat with Samwell about
 * one. Where a post opens is `openArticle`'s to say (`article-route.ts`): in
 * the reader, on its site, or, for a blog that shares only openings and has
 * not been asked about yet, after the reader says which (`onAsk`).
 */
export function useOpenArticle(onAsk?: AskWholePosts) {
  const router = useRouter();

  /** The post's reader copy for reading or listening; null when it opened elsewhere, needs asking, or failed. */
  const toBook = React.useCallback(
    async (post: OpenablePost, intent: ArticleIntent): Promise<string | null> => {
      const opened = await withPost(post, () => routeArticle(post.id, intent === 'listen' ? 'listen' : 'read'));
      if (!opened) return null;
      if (opened.to === 'reader') return opened.bookId;
      if (opened.to === 'ask') onAsk?.({ blog: opened.blog, post, intent });
      else if (intent === 'listen') cannotListen(opened);
      else openOnSite(opened);
      return null;
    },
    [onAsk],
  );

  const openArticle = React.useCallback(
    async (post: OpenablePost) => {
      const bookId = await toBook(post, 'open');
      if (bookId) router.push({ pathname: '/reader/[id]', params: { id: bookId } });
    },
    [toBook, router],
  );

  const prepareToListen = React.useCallback((post: OpenablePost) => toBook(post, 'listen'), [toBook]);

  /** The copy a chat is grounded in: the whole post, or the opening the feed carries. */
  const prepareForChat = React.useCallback(async (post: OpenablePost) => {
    const opened = await withPost(post, () => routeArticle(post.id, 'chat'));
    return opened?.to === 'reader' ? opened.bookId : null;
  }, []);

  // On the Samwell page, as any chat is, with the post waiting as its book.
  // From a screen above the hub (a blog's page, a shelf's), back down to it.
  const chatAboutArticle = React.useCallback(
    async (post: OpenablePost) => {
      const bookId = await prepareForChat(post);
      if (!bookId) return;
      await askSamwellAbout({ id: bookId, title: post.title, kind: 'article' });
      if (router.canDismiss()) router.dismissTo('/');
    },
    [prepareForChat, router],
  );

  return { openArticle, prepareToListen, prepareForChat, chatAboutArticle };
}
