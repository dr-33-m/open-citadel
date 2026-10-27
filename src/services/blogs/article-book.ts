/**
 * A blog post, opened in the reader.
 *
 * The reader reads EPUBs, and it is where highlights, notes, tags, chats with
 * Samwell and read-aloud all live. So rather than a second reader for posts,
 * a post is written as a one-chapter EPUB (`epub/package.ts`) the first time
 * it is opened, and given a `books` row of kind `article`. From then on it is
 * a book to everything downstream: its highlights reach the Timeline, Compass
 * and Samwell's search of what has been read, with no code of their own.
 *
 * The copy is written once and kept, so a post read and highlighted stays
 * readable after the blog drops it from its feed, or goes offline.
 */
import { eq } from 'drizzle-orm';
import { documentDirectory, getInfoAsync } from 'expo-file-system/legacy';

import { db } from '@/db/client';
import { blogArticles, books } from '@/db/schema';
import { getArticle, type ArticleDetail } from '@/services/blogs/articles';
import { keepPostCover } from '@/services/blogs/post-cover';
import { articleEpubFiles } from '@/services/blogs/epub/package';
import { toXhtmlBody } from '@/services/blogs/epub/xhtml';
import { extractArticle, isTeaser } from '@/services/blogs/full-text';
import { writeEpubFile } from '@/services/epub/write';
import { fetchPage } from '@/services/feeds/fetch';
import { newId, nowIso } from '@/services/rows';

const ARTICLES_DIR = `${documentDirectory}articles/`;

export class ArticleOpenError extends Error {}

/**
 * The post's whole text. The feed's copy when it is the post; the page's
 * article when the feed carries a teaser; the teaser when the page cannot be
 * read (offline, a paywall), since some of the post beats none of it.
 */
async function readableHtml({ article }: ArticleDetail, signal?: AbortSignal): Promise<string> {
  const fromFeed = article.contentHtml;
  if (!isTeaser(fromFeed)) return fromFeed!;
  try {
    const page = await fetchPage(article.link, signal);
    const extracted = await extractArticle(page.body);
    if (extracted) return extracted;
  } catch {
    if (signal?.aborted) throw new ArticleOpenError('Cancelled.');
  }
  if (fromFeed?.trim()) return fromFeed;
  throw new ArticleOpenError('This post could not be loaded. Open the original to read it on the web.');
}

/** The copy already written, when there is one and its file is still there. */
async function existingCopy(bookId: string | null): Promise<string | null> {
  if (!bookId) return null;
  const row = db.select({ filePath: books.filePath }).from(books).where(eq(books.id, bookId)).get();
  if (!row?.filePath) return null;
  return (await getInfoAsync(row.filePath)).exists ? bookId : null;
}

/**
 * The reader's book for a post, written on first opening. Marks the post
 * read, since opening it is reading it. Returns the book id to open.
 */
export async function openArticleBook(articleId: string, signal?: AbortSignal): Promise<string> {
  const detail = await getArticle(articleId);
  if (!detail) throw new ArticleOpenError('This post is no longer in your library.');
  const { article, blog } = detail;

  const ready = await existingCopy(article.bookId);
  if (ready) {
    if (!article.readAt) await db.update(blogArticles).set({ readAt: nowIso() }).where(eq(blogArticles.id, article.id));
    void keepPostCover(ready);
    return ready;
  }

  const html = await readableHtml(detail, signal);
  const files = articleEpubFiles({
    id: article.id,
    title: article.title,
    blogTitle: blog.title,
    author: article.author,
    publishedAt: article.publishedAt,
    language: blog.language,
    link: article.link,
    bodyXhtml: toXhtmlBody(html, article.link),
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
    // An upsert: a copy made before may have lost its file, or its row.
    tx.insert(books)
      .values({ id: bookId, ...row, addedAt: now })
      .onConflictDoUpdate({ target: books.id, set: row })
      .run();
    tx.update(blogArticles)
      .set({ bookId, readAt: article.readAt ?? now })
      .where(eq(blogArticles.id, article.id))
      .run();
  });
  // The row names the blog's address for it until the picture is on the phone.
  void keepPostCover(bookId);
  return bookId;
}
