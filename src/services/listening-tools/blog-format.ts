/**
 * The blogs as Samwell reads them: one line a blog or a post, within the tool
 * result budget. Pure.
 */
import { clamp, day, fitLines, plural } from '@/services/listening-tools/format';

export interface BlogSummary {
  id: string;
  title: string;
  following: boolean;
  posts: number;
  read: number;
  finished: number;
  queued: number;
  favorites: number;
  lastReadAt: string | null;
}

export interface PostSummary {
  id: string;
  blog: string;
  title: string;
  author: string | null;
  publishedAt: string;
  readAt: string | null;
  finishedAt: string | null;
  queuedAt: string | null;
  favoritedAt: string | null;
  openedInReader: boolean;
  summary: string | null;
}

export function formatBlogs(blogs: readonly BlogSummary[], tokenBudget: number): string {
  if (blogs.length === 0) return 'They follow no blogs yet, or none matched.';
  const head = `${plural(blogs.length, 'blog')}, most recently read first:`;
  const entries = blogs.map((blog) => {
    const facts = [
      plural(blog.posts, 'post'),
      `${blog.read} read`,
      blog.finished > 0 ? `${blog.finished} finished` : null,
      blog.queued > 0 ? `${blog.queued} in their queue` : null,
      blog.favorites > 0 ? `${blog.favorites} favourited` : null,
      blog.lastReadAt ? `last read ${day(blog.lastReadAt)}` : 'never read',
      blog.following ? null : 'not followed',
    ].filter(Boolean);
    return `- "${blog.title}": ${facts.join('; ')}`;
  });
  return fitLines(head, entries, tokenBudget, 'blogs');
}

export function formatPosts(posts: readonly PostSummary[], total: number, tokenBudget: number): string {
  if (posts.length === 0) return 'No post matched.';
  const head = `${plural(total, 'post')} matched${total > posts.length ? `, the first ${posts.length} here` : ''}:`;
  const entries = posts.map((post) => {
    const facts = [
      `out ${day(post.publishedAt)}`,
      post.finishedAt ? `finished ${day(post.finishedAt)}` : post.readAt ? `read ${day(post.readAt)}` : 'unread',
      post.queuedAt ? 'in their queue' : null,
      post.favoritedAt ? 'favourite' : null,
      post.openedInReader ? 'readable in full with read_chapter' : null,
    ].filter(Boolean);
    const lines = [`- "${post.title}" (${post.blog}${post.author ? `, by ${post.author}` : ''}): ${facts.join('; ')}`];
    if (post.summary) lines.push(`  ${clamp(post.summary, 240)}`);
    return lines.join('\n');
  });
  return fitLines(head, entries, tokenBudget, 'posts');
}
