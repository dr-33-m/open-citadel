import { toolDefinition } from '@tanstack/ai/client';
import { z } from 'zod';

/**
 * The podcasts and blogs, as Samwell sees them.
 *
 * Until these, the library he could see was the books: a reader who had
 * finished forty episodes of one show and followed a dozen blogs was, as far
 * as he could tell, someone who only read. Every tool here reads the device's
 * own database and changes nothing, so none of them needs an approval.
 *
 * Cloud only, like the journey: the results are long, and no on-device window
 * has room for a library's worth of shows.
 */

/** A count the activity line can say, beside the text the model reads. */
const ListOutputSchema = z.object({
  total: z.number(),
  formatted: z.string(),
});

export const ListMyPodcastsInputSchema = z.object({
  query: z.string().optional().describe('Words from a show’s name or host, to find one. Omit to list them all.'),
  include_unfollowed: z
    .boolean()
    .optional()
    .describe('Also list shows they only previewed or stopped following, whose history is kept.'),
});

export const listMyPodcastsTool = toolDefinition({
  name: 'list_my_podcasts',
  description:
    "List the podcasts the user follows, each with how many episodes it has, how many they have listened to, how many are partway, favourited, in Up Next and downloaded, how long they have spent listening to it and when they last did. Starts with how much they have listened lately. Call this when they ask what they listen to, or before saying anything about their podcasts. To look inside one show, pass its name to search_podcast_episodes.",
  inputSchema: ListMyPodcastsInputSchema,
  outputSchema: ListOutputSchema,
});

export const EpisodeStatusSchema = z.enum(['listened', 'in_progress', 'unplayed', 'new']);

export const SearchPodcastEpisodesInputSchema = z.object({
  query: z.string().optional().describe('Words from the episode’s title or show notes, or its show’s name.'),
  show: z.string().optional().describe('Only this show (its name, partial match ok).'),
  status: EpisodeStatusSchema.optional().describe(
    'listened: finished. in_progress: started, not finished. unplayed: not started. new: arrived and not looked at yet.',
  ),
  favorites: z.boolean().optional().describe('Only favourited episodes.'),
  up_next: z.boolean().optional().describe('Only the Up Next queue, in the order it will play.'),
  downloaded: z.boolean().optional().describe('Only episodes downloaded to the device.'),
});

export const searchPodcastEpisodesTool = toolDefinition({
  name: 'search_podcast_episodes',
  description:
    "Find episodes of the user's podcasts: by words, by show, and by what they have done with them (listened, in progress, unplayed, new), favourites, Up Next in its order, or downloaded. With no filters, the episodes they listened to most recently. Each says its show, when it came out, how long it is, how far they got and when, and its episode_id for get_podcast_episode. Listened episodes come most recently finished first, which is their listening history.",
  inputSchema: SearchPodcastEpisodesInputSchema,
  outputSchema: ListOutputSchema,
});

export const GetPodcastEpisodeInputSchema = z.object({
  episode_id: z.string().describe('The episode_id search_podcast_episodes gave.'),
});

export const getPodcastEpisodeTool = toolDefinition({
  name: 'get_podcast_episode',
  description:
    "Read one episode in full: its show notes, its chapters with their times, its link, and where the user is in it. Use this to talk about what an episode covers. The show notes are the publisher's description, not a transcript, so say so rather than claim to know everything that was said.",
  inputSchema: GetPodcastEpisodeInputSchema,
  outputSchema: z.object({ formatted: z.string() }),
});

export const ListMyBlogsInputSchema = z.object({
  query: z.string().optional().describe('Words from a blog’s name, to find one. Omit to list them all.'),
});

export const listMyBlogsTool = toolDefinition({
  name: 'list_my_blogs',
  description:
    "List the blogs the user follows, each with how many posts it has, how many they have read and finished, how many are in their queue or favourited, and when they last read one. Call this when they ask what they read online, or before saying anything about their blogs.",
  inputSchema: ListMyBlogsInputSchema,
  outputSchema: ListOutputSchema,
});

export const PostStatusSchema = z.enum(['unread', 'read', 'finished']);

export const SearchBlogPostsInputSchema = z.object({
  query: z.string().optional().describe('Words from the post’s title, summary or author, or its blog’s name.'),
  blog: z.string().optional().describe('Only this blog (its name, partial match ok).'),
  status: PostStatusSchema.optional().describe('unread: never opened. read: opened. finished: marked finished.'),
  queued: z.boolean().optional().describe('Only posts in their reading queue.'),
  favorites: z.boolean().optional().describe('Only favourited posts.'),
});

export const searchBlogPostsTool = toolDefinition({
  name: 'search_blog_posts',
  description:
    "Find posts from the blogs the user follows: by words, by blog, by whether they have read or finished them, in their queue, or favourited. With no filters, what they read most recently. Each says its blog, author, date, a summary, and what they have done with it. A post they have opened can be searched and read in full with search_reading and read_chapter, by its title.",
  inputSchema: SearchBlogPostsInputSchema,
  outputSchema: ListOutputSchema,
});

export const LISTENING_TOOL_DEFINITIONS = [
  listMyPodcastsTool,
  searchPodcastEpisodesTool,
  getPodcastEpisodeTool,
  listMyBlogsTool,
  searchBlogPostsTool,
] as const;

export const LISTENING_TOOL_NAMES: ReadonlySet<string> = new Set(LISTENING_TOOL_DEFINITIONS.map((tool) => tool.name));

/**
 * What he is told about them, on the cloud route alone and only when the app
 * declared the tools: a prompt that names a tool the app cannot run is a turn
 * spent calling something that is not there.
 */
export const SAMWELL_LISTENING_TOOL_PROMPT = `Their podcasts and blogs are part of what they take in, as much as their books. list_my_podcasts and search_podcast_episodes show what they follow and what they have listened to, are partway through, favourited or lined up in Up Next; get_podcast_episode reads one episode's show notes and chapters. list_my_blogs and search_blog_posts do the same for the blogs they follow. Look before you say anything about what they listen to or read online, and draw on it the way you draw on their books.`;
