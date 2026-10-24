/**
 * The podcast and blog tools, run on the device: each reads the library's own
 * tables and answers in the lines Samwell reads. Read-only, so none of them is
 * approval-gated. Cloud only (see `listening-tools.ts` in samwell-shared).
 */
import { formatBlogs, formatPosts } from '@/services/listening-tools/blog-format';
import { listBlogs, searchPosts, type PostSearch } from '@/services/listening-tools/blogs';
import { formatEpisode, formatEpisodes, formatShows } from '@/services/listening-tools/podcast-format';
import { listeningTotals, listShows, readEpisode, searchEpisodes, type EpisodeSearch } from '@/services/listening-tools/podcasts';
import { CHARS_PER_TOKEN } from '@/services/context-budget';
import { TOOL_RESULT_TOKEN_BUDGET } from '@/services/tool-limits';

const BUDGET = TOOL_RESULT_TOKEN_BUDGET.cloud;
/** Show notes may take most of a result; the rest is the episode's own lines and its chapters. */
const NOTES_CHARS = Math.floor(BUDGET * CHARS_PER_TOKEN * 0.6);

export function runListMyPodcasts(input: { query?: string; include_unfollowed?: boolean }) {
  const shows = listShows(input.query, input.include_unfollowed === true);
  return { total: shows.length, formatted: formatShows(shows, listeningTotals(), BUDGET) };
}

export function runSearchPodcastEpisodes(input: {
  query?: string;
  show?: string;
  status?: EpisodeSearch['status'];
  favorites?: boolean;
  up_next?: boolean;
  downloaded?: boolean;
}) {
  const { episodes, total } = searchEpisodes({
    query: input.query,
    show: input.show,
    status: input.status,
    favorites: input.favorites,
    upNext: input.up_next,
    downloaded: input.downloaded,
  });
  return { total, formatted: formatEpisodes(episodes, total, BUDGET) };
}

export function runGetPodcastEpisode(input: { episode_id: string }) {
  const found = input.episode_id ? readEpisode(input.episode_id) : null;
  if (!found) return { formatted: `There is no episode with id ${input.episode_id}. Take the episode_id from search_podcast_episodes.` };
  return { formatted: formatEpisode(found.episode, found.chapters, NOTES_CHARS) };
}

export function runListMyBlogs(input: { query?: string }) {
  const blogs = listBlogs(input.query);
  return { total: blogs.length, formatted: formatBlogs(blogs, BUDGET) };
}

export function runSearchBlogPosts(input: PostSearch) {
  const { posts, total } = searchPosts(input);
  return { total, formatted: formatPosts(posts, total, BUDGET) };
}
