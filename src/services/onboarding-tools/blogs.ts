/**
 * `list_blogs` and `follow_blogs`: a few blogs that fit what the reader said,
 * from the directory Explore offers.
 *
 * The whole directory rather than a search. It is a few dozen blogs, each
 * with a line on what it is, which is small enough to hand over in one go and
 * is chosen from far better by reading than by matching keywords against it.
 */
import { followByAddress } from '@/services/blogs/actions';
import { BLOG_DIRECTORY, listedDirectory } from '@/services/blogs/directory';
import {
  blogBySlug,
  followOutcome,
  formatBlogDirectory,
  type FollowResult,
} from '@/services/onboarding-tools/format';
import { invalidateBlogLibrary } from '@/query-manager/blogs/invalidate';
import { publisherRules } from '@/services/publishers';

/** The directory as Explore lists it: without the blogs whose publishers asked to be left out. */
const listed = () => listedDirectory(BLOG_DIRECTORY, publisherRules());

export function runListBlogs(): { formatted: string } {
  return { formatted: formatBlogDirectory(listed()) };
}

export async function runFollowBlogs(input: { blog_ids: string[] }): Promise<FollowResult> {
  const chosen = [...new Set(input.blog_ids)].flatMap((slug) => blogBySlug(listed().flatMap((section) => section.blogs), slug) ?? []);
  if (chosen.length === 0) {
    return {
      ok: false,
      followed: [],
      failed: [],
      error: 'None of those ids are on the list. Call list_blogs and choose from what it returns.',
    };
  }

  const settled = await Promise.allSettled(chosen.map((blog) => followByAddress(blog.feedUrl)));
  const outcome = followOutcome(chosen, settled, (blog) => blog.title);
  if (outcome.failed.length > 0) console.warn('[onboarding] follow_blogs failures:', outcome.failed);

  if (outcome.ok) invalidateBlogLibrary();
  return outcome;
}
