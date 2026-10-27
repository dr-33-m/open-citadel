import { beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateAppDb } from '@/db/__tests__/app-db';

import { db } from '@/db/client';
import { blogArticles, blogs, podcastChapters, podcastEpisodes, podcastListeningDays, podcasts } from '@/db/schema';
import {
  runGetPodcastEpisode,
  runListMyBlogs,
  runListMyPodcasts,
  runSearchBlogPosts,
  runSearchPodcastEpisodes,
} from '@/services/listening-tools';
import { readPodcastCard } from '@/services/listening-tools/card';
import { localDayString } from '@/utils/day';

// Where downloads live, for an episode's saved cover: only the folder's name is read.
vi.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///docs/' }));
vi.mock('@/db/client', async () => {
  const { appDb } = await import('@/db/__tests__/app-db');
  return { db: appDb() };
});

const NOW = new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

function show(id: string, title: string, state: 'subscribed' | 'preview' = 'subscribed', customTitle: string | null = null) {
  return { id, feedUrl: `https://example.com/${id}.xml`, title, customTitle, author: 'Host', state, createdAt: NOW, updatedAt: NOW };
}

function episode(id: string, podcastId: string, title: string, extra: Partial<typeof podcastEpisodes.$inferInsert> = {}) {
  return { id, podcastId, title, audioUrl: `https://example.com/${id}.mp3`, durationSec: 3600, addedAt: NOW, updatedAt: NOW, ...extra };
}

beforeAll(async () => {
  await migrateAppDb();
  db.insert(podcasts)
    .values([show('p1', 'Deep Work Radio'), show('p2', 'The Stoic Hour', 'subscribed', 'Stoics'), show('p3', 'Just Looking', 'preview')])
    .run();
  db.insert(podcastEpisodes)
    .values([
      episode('e1', 'p1', 'On focus and attention', {
        playState: 'played',
        completedAt: daysAgo(2),
        lastPlayedAt: daysAgo(2),
        playedDurationSec: 3600,
        isFavorite: 1,
        summary: 'Why attention is the scarce thing.',
        description: '<p>Why <b>attention</b> is the scarce thing.</p>',
        pubDate: daysAgo(10),
      }),
      episode('e2', 'p1', 'Shallow work, examined', { positionSec: 1200, lastPlayedAt: daysAgo(1), playedDurationSec: 1200, queuePosition: 1 }),
      episode('e3', 'p1', 'Inbox zero', { playState: 'new', queuePosition: 0, downloadStatus: 'downloaded' }),
      episode('e4', 'p2', 'Marcus on mornings', { playState: 'played', completedAt: daysAgo(40), lastPlayedAt: daysAgo(40) }),
      episode('e5', 'p3', 'A preview episode'),
    ])
    .run();
  db.insert(podcastChapters)
    .values([
      { id: 'c2', episodeId: 'e1', startSec: 600, title: 'Attention residue' },
      { id: 'c1', episodeId: 'e1', startSec: 0, title: 'Intro' },
    ])
    .run();
  db.insert(podcastListeningDays)
    .values({ id: 'd1', day: localDayString(), episodeId: 'e2', podcastId: 'p1', seconds: 1200, updatedAt: NOW })
    .run();

  db.insert(blogs)
    .values([
      { id: 'b1', feedUrl: 'https://a.example/feed', title: 'Paul Graham', createdAt: NOW },
      { id: 'b2', feedUrl: 'https://b.example/feed', title: 'Someone Else', state: 'preview', createdAt: NOW },
    ])
    .run();
  const post = (id: string, blogId: string, title: string, extra: Partial<typeof blogArticles.$inferInsert> = {}) => ({
    id,
    blogId,
    title,
    link: `https://example.com/${id}`,
    publishedAt: daysAgo(30),
    fetchedAt: NOW,
    ...extra,
  });
  db.insert(blogArticles)
    .values([
      post('a1', 'b1', 'How to Do Great Work', { readAt: daysAgo(3), finishedAt: daysAgo(3), favoritedAt: daysAgo(3), bookId: 'bk-a1' }),
      post('a2', 'b1', 'Superlinear Returns', { savedAt: daysAgo(1), summary: 'Returns for performance are superlinear.' }),
      post('a3', 'b1', 'Unread essay'),
      post('a4', 'b2', 'A preview post nobody read'),
      post('a5', 'b2', 'A preview post they did read', { readAt: daysAgo(5) }),
    ])
    .run();
});

describe('list_my_podcasts', () => {
  it('lists the shows they follow with what they did with each, most recently listened first', () => {
    const { total, formatted } = runListMyPodcasts({});
    expect(total).toBe(2);
    expect(formatted).not.toContain('Just Looking');
    expect(formatted.indexOf('Deep Work Radio')).toBeLessThan(formatted.indexOf('Stoics'));
    expect(formatted).toContain('"Deep Work Radio" by Host: 3 episodes; 1 played; 1 partway; 1 new; 1 favourited; 2 in Up Next; 1 downloaded; 1h 20m listened');
    expect(formatted).toContain('20m in the last 7 days');
    expect(formatted).toContain('1 episode finished in the last 30 days, 2 in Up Next');
  });

  it('uses the name the reader gave a show, and finds a show by it', () => {
    expect(runListMyPodcasts({ query: 'stoics' }).formatted).toContain('"Stoics"');
  });

  it('includes shows only previewed when asked', () => {
    const { total, formatted } = runListMyPodcasts({ include_unfollowed: true });
    expect(total).toBe(3);
    expect(formatted).toContain('"Just Looking" by Host: 1 episode; 0 played; never listened; not followed');
  });
});

describe('search_podcast_episodes', () => {
  it('gives the listening history, most recently finished first', () => {
    const { total, formatted } = runSearchPodcastEpisodes({ status: 'listened' });
    expect(total).toBe(2);
    expect(formatted.indexOf('On focus and attention')).toBeLessThan(formatted.indexOf('Marcus on mornings'));
  });

  it('gives Up Next in the order it will play', () => {
    const { formatted } = runSearchPodcastEpisodes({ up_next: true });
    expect(formatted.indexOf('Inbox zero')).toBeLessThan(formatted.indexOf('Shallow work'));
    expect(formatted).toContain('Up Next #1');
    expect(formatted).toContain('Up Next #2');
  });

  it('finds what is partway, with how far they got', () => {
    const { total, formatted } = runSearchPodcastEpisodes({ status: 'in_progress' });
    expect(total).toBe(1);
    expect(formatted).toContain('partway, at 20m with 40m left');
  });

  it('finds favourites, downloads, and episodes of one show', () => {
    expect(runSearchPodcastEpisodes({ favorites: true }).total).toBe(1);
    expect(runSearchPodcastEpisodes({ downloaded: true }).formatted).toContain('Inbox zero');
    expect(runSearchPodcastEpisodes({ show: 'stoic' }).formatted).toContain('Marcus on mornings');
  });

  it('leaves out episodes of a show only previewed and never listened to', () => {
    expect(runSearchPodcastEpisodes({}).formatted).not.toContain('A preview episode');
  });

  it('finds episodes by words in their notes, best first', () => {
    const { total, formatted } = runSearchPodcastEpisodes({ query: 'attention' });
    expect(total).toBe(1);
    expect(formatted).toContain('episode_id: e1');
  });
});

describe('get_podcast_episode', () => {
  it('reads the show notes as text and the chapters in order', () => {
    const { formatted } = runGetPodcastEpisode({ episode_id: 'e1' });
    expect(formatted).toContain('Why attention is the scarce thing.');
    expect(formatted.indexOf('0:00 Intro')).toBeLessThan(formatted.indexOf('10:00 Attention residue'));
  });

  it('says so for an id that is not there', () => {
    expect(runGetPodcastEpisode({ episode_id: 'nope' }).formatted).toContain('There is no episode with id nope');
  });
});

describe('list_my_blogs and search_blog_posts', () => {
  it('lists followed blogs with what was read', () => {
    const { total, formatted } = runListMyBlogs({});
    expect(total).toBe(1);
    expect(formatted).toContain('"Paul Graham": 3 posts; 1 read; 1 finished; 1 in their queue; 1 favourited');
  });

  it('finds posts by state, leaving out an unread stranger’s archive', () => {
    expect(runSearchBlogPosts({ status: 'unread' }).formatted).not.toContain('nobody read');
    expect(runSearchBlogPosts({ status: 'read' }).total).toBe(2);
    expect(runSearchBlogPosts({ queued: true }).formatted).toContain('Superlinear Returns');
    expect(runSearchBlogPosts({ favorites: true }).formatted).toContain('readable in full with read_chapter');
  });

  it('finds posts by words, most recently read first without them', () => {
    expect(runSearchBlogPosts({ query: 'superlinear' }).total).toBe(1);
    const recent = runSearchBlogPosts({}).formatted;
    expect(recent.indexOf('How to Do Great Work')).toBeLessThan(recent.indexOf('Unread essay'));
  });
});

describe('the podcast card', () => {
  it('draws a show with how much of it was played', () => {
    expect(readPodcastCard('show', 'p1')).toEqual({
      title: 'Deep Work Radio',
      subtitle: 'Host',
      coverUri: null,
      status: '1 of 3 episodes played',
    });
  });

  it('draws a followed show nothing was played of as followed', () => {
    db.insert(podcasts).values(show('p4', 'Fresh Show')).run();
    expect(readPodcastCard('show', 'p4')?.status).toBe('Following');
  });

  it('draws an episode with where the listener is in it', () => {
    expect(readPodcastCard('episode', 'e1')?.status).toBe('Played');
    expect(readPodcastCard('episode', 'e2')).toMatchObject({ subtitle: 'Deep Work Radio', status: '40m left' });
    expect(readPodcastCard('episode', 'e3')?.status).toBe('In Up Next');
  });

  it('draws nothing for what is no longer on the device', () => {
    expect(readPodcastCard('episode', 'gone')).toBeNull();
    expect(readPodcastCard('show', 'gone')).toBeNull();
  });

  it('is what the tools point at: every show and episode line carries its marker', () => {
    expect(runListMyPodcasts({}).formatted).toContain('Ref: [[podcast:p1]]');
    expect(runSearchPodcastEpisodes({ status: 'listened' }).formatted).toContain('Ref: [[episode:e1]]');
    expect(runGetPodcastEpisode({ episode_id: 'e1' }).formatted).toContain('Ref: [[episode:e1]]');
  });
});
