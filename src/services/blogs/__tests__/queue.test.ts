import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { migrateAppDb } from '@/db/__tests__/app-db';
import { db } from '@/db/client';
import { blogArticles, blogs } from '@/db/schema';
import { listShelf, setArticleFinished } from '@/services/blogs/articles';
import { moveArticleInQueue, setArticleQueued } from '@/services/blogs/queue';

// `services/rows` is reached for its timestamps; its ids, and the native module behind them, are not.
vi.mock('expo-crypto', () => ({ randomUUID: () => 'id' }));
vi.mock('@/db/client', async () => {
  const { appDb } = await import('@/db/__tests__/app-db');
  return { db: appDb() };
});

const NOW = new Date().toISOString();
const post = (id: string) => ({ id, blogId: 'b1', title: id, link: `https://example.com/${id}`, publishedAt: NOW, fetchedAt: NOW });
const queue = async () => (await listShelf('queue', 50)).map((a) => a.id);

beforeAll(async () => {
  await migrateAppDb();
  db.insert(blogs).values({ id: 'b1', feedUrl: 'https://a.example/feed', title: 'A blog', createdAt: NOW }).run();
});

beforeEach(() => {
  db.delete(blogArticles).run();
  db.insert(blogArticles).values(['a', 'b', 'c', 'd'].map(post)).run();
});

describe('the blogs queue', () => {
  it('adds each post at its end', async () => {
    for (const id of ['c', 'a', 'b']) await setArticleQueued(id, true);
    expect(await queue()).toEqual(['c', 'a', 'b']);
  });

  it('moves a post to a new place, the rest closing up around it', async () => {
    for (const id of ['a', 'b', 'c', 'd']) await setArticleQueued(id, true);
    await moveArticleInQueue('d', 0);
    expect(await queue()).toEqual(['d', 'a', 'b', 'c']);
    await moveArticleInQueue('d', 2);
    expect(await queue()).toEqual(['a', 'b', 'd', 'c']);
    await moveArticleInQueue('a', 99);
    expect(await queue()).toEqual(['b', 'd', 'c', 'a']);
  });

  it('lets go of a post taken out or finished, and keeps the order of the rest', async () => {
    for (const id of ['a', 'b', 'c', 'd']) await setArticleQueued(id, true);
    await setArticleQueued('b', false);
    await setArticleFinished('c', true);
    expect(await queue()).toEqual(['a', 'd']);
    const gone = db.select({ position: blogArticles.queuePosition }).from(blogArticles).where(eq(blogArticles.id, 'c')).get();
    expect(gone?.position).toBeNull();
    await setArticleQueued('b', true);
    expect(await queue()).toEqual(['a', 'd', 'b']);
  });
});
