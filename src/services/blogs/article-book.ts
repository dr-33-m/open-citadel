/**
 * A blog post, opened in the reader, or on its site.
 *
 * The reader reads EPUBs, and it is where highlights, notes, tags, chats with
 * Samwell and read-aloud all live. So rather than a second reader for posts,
 * a post is written as a one-chapter EPUB (`epub/package.ts`) the first time
 * it is opened, and given a `books` row of kind `article`. From then on it is
 * a book to everything downstream: its highlights reach the Timeline, Compass
 * and Samwell's search of what has been read, with no code of their own.
 *
 * What goes into that copy is the publisher's to say as much as the
 * reader's: `article-route.ts` decides, this carries it out. A copy is kept
 * while it is kept on purpose or read lately (`article-copies.ts`).
 */
import { and, eq, isNotNull } from 'drizzle-orm';
import { documentDirectory, getInfoAsync } from 'expo-file-system/legacy';

import { db } from '@/db/client';
import { blogArticles, books } from '@/db/schema';
import { forgetIndexedBook } from '@/services/book-text/indexer';
import { getArticle, type ArticleDetail } from '@/services/blogs/articles';
import { articleRoute } from '@/services/blogs/article-route';
import { articleEpubFiles } from '@/services/blogs/epub/package';
import { toXhtmlBody } from '@/services/blogs/epub/xhtml';
import { storedExcerpt } from '@/services/blogs/feed/excerpt';
import { extractArticle, pageReservesRights } from '@/services/blogs/full-text';
import { keepPostCover } from '@/services/blogs/post-cover';
import { writeEpubFile } from '@/services/epub/write';
import { fetchPage } from '@/services/feeds/fetch';
import { permissionsFor } from '@/services/publishers';
import { newId, nowIso } from '@/services/rows';
import { hostOf } from '@/utils/urls';

const ARTICLES_DIR = `${documentDirectory}articles/`;

export class ArticleOpenError extends Error {}

/** A blog whose reader has not yet said how its summaries are read. */
export type WholePostsAsk = { blogId: string; blogTitle: string; host: string };

export type ArticleOpen =
  | { to: 'reader'; bookId: string }
  /** `reason` is said in a toast when the site is not what the reader chose. */
  | { to: 'site'; link: string; reason: string | null }
  | { to: 'ask'; blog: WholePostsAsk };

/** The copy already written, when there is one and its file is still there. */
async function existingCopy(bookId: string | null): Promise<string | null> {
  if (!bookId) return null;
  const row = db.select({ filePath: books.filePath }).from(books).where(eq(books.id, bookId)).get();
  if (!row?.filePath) return null;
  return (await getInfoAsync(row.filePath)).exists ? bookId : null;
}

/** The whole post from its page; null when it cannot be had (offline, a paywall), `reserved` when the page asks not to be kept. */
async function fromPage(link: string, signal?: AbortSignal): Promise<string | 'reserved' | null> {
  try {
    const page = await fetchPage(link, signal);
    if (pageReservesRights(page.body, page.robots, page.tdmReserved)) return 'reserved';
    return await extractArticle(page.body);
  } catch {
    if (signal?.aborted) throw new ArticleOpenError('Cancelled.');
    return null;
  }
}

/** Writes the reader's copy and its `books` row. Returns the book id. */
async function writeCopy({ article, blog }: ArticleDetail, html: string, whole: boolean): Promise<string> {
  const files = articleEpubFiles({
    id: article.id,
    title: article.title,
    blogTitle: blog.title,
    author: article.author,
    publishedAt: article.publishedAt,
    language: blog.language,
    link: article.link,
    bodyXhtml: toXhtmlBody(html, article.link),
    rights: blog.rights,
    opening: !whole,
  });
  const filePath = await writeEpubFile(ARTICLES_DIR, article.id, files);

  const bookId = article.bookId ?? newId();
  const now = nowIso();
  const row = {
    title: article.title,
    author: article.author ? `${article.author}, ${blog.title}` : blog.title,
    coverUrl: article.imageUrl ?? blog.imageUrl,
    filePath,
    format: 'epub' as const,
    kind: 'article' as const,
  };
  db.transaction((tx) => {
    // An upsert: a copy made before may have lost its file, or its row, or be
    // the opening that the whole post now replaces.
    tx.insert(books)
      .values({ id: bookId, ...row, addedAt: now })
      .onConflictDoUpdate({ target: books.id, set: row })
      .run();
    tx.update(blogArticles)
      .set({ bookId, copyWhole: whole, readAt: article.readAt ?? now })
      .where(eq(blogArticles.id, article.id))
      .run();
  });
  // Samwell's search reads the copy afresh rather than quoting the one replaced.
  if (article.bookId) void forgetIndexedBook(bookId);
  // The row names the blog's address for it until the picture is on the phone.
  void keepPostCover(bookId);
  return bookId;
}

/** Whether a post's feed carries only its opening; for a post stored before that was asked, what its blog's newer posts say. */
function isExcerpt({ article }: ArticleDetail): boolean {
  if (article.feedExcerpt !== null) return article.feedExcerpt;
  const known = db
    .select({ excerpt: blogArticles.feedExcerpt })
    .from(blogArticles)
    .where(and(eq(blogArticles.blogId, article.blogId), isNotNull(blogArticles.feedExcerpt)))
    .limit(20)
    .all()
    .map((row) => row.excerpt === true);
  return storedExcerpt(known, article.contentHtml);
}

function markRead(articleId: string, readAt: string | null): void {
  if (!readAt) db.update(blogArticles).set({ readAt: nowIso() }).where(eq(blogArticles.id, articleId)).run();
}

/**
 * Where a post opens, writing its reader copy first if that is where. Opening
 * it is reading it, so it is marked read, on its site too; listening marks it
 * only once a copy is made. A chat (`purpose: 'chat'`) always gets a copy, of
 * the whole post or of the opening the feed carries.
 */
export async function openArticle(
  articleId: string,
  purpose: 'read' | 'listen' | 'chat',
  signal?: AbortSignal,
): Promise<ArticleOpen> {
  const detail = await getArticle(articleId);
  if (!detail) throw new ArticleOpenError('This post is no longer in your library.');
  const { article, blog } = detail;
  const copy = await existingCopy(article.bookId);
  const host = hostOf(article.link) ?? blog.title;
  const opening = article.contentHtml?.trim() || article.summary?.trim() || null;
  const route = articleRoute({
    purpose: purpose === 'chat' ? 'chat' : 'read',
    excerpt: isExcerpt(detail),
    copy: copy ? (article.copyWhole === false ? 'opening' : 'whole') : null,
    wholePosts: blog.wholePosts,
    allowed: permissionsFor(article.link).wholePosts,
  });

  const toSite = (reason: string | null): ArticleOpen => {
    if (purpose === 'read') markRead(article.id, article.readAt);
    return { to: 'site', link: article.link, reason };
  };
  const inReader = (bookId: string): ArticleOpen => ({ to: 'reader', bookId });
  /** The opening, for a chat or when the whole post cannot be had; the site when there is none. */
  const openingOr = async (reason: string | null): Promise<ArticleOpen> => {
    if (copy && purpose === 'chat') return inReader(copy);
    if (opening && (purpose === 'chat' || reason === null)) return inReader(await writeCopy(detail, opening, false));
    if (purpose === 'chat') throw new ArticleOpenError('This post could not be loaded. Open the original to read it on the web.');
    return toSite(reason);
  };

  switch (route) {
    case 'copy':
      markRead(article.id, article.readAt);
      void keepPostCover(copy!);
      return inReader(copy!);
    case 'site':
      return toSite(null);
    case 'ask':
      return { to: 'ask', blog: { blogId: blog.id, blogTitle: blog.title, host } };
    case 'feed':
      if (!article.contentHtml?.trim()) return openingOr(null);
      return inReader(await writeCopy(detail, article.contentHtml, true));
    case 'opening':
      return openingOr(null);
    case 'page': {
      const whole = await fromPage(article.link, signal);
      if (whole === 'reserved') return openingOr(`${host} asks that its posts are not saved, so this one is read on its site.`);
      // Offline or behind a paywall: some of the post beats none of it, and the next opening tries the page again.
      if (whole === null) return openingOr(null);
      return inReader(await writeCopy(detail, whole, true));
    }
  }
}
