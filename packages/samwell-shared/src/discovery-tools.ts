import { followBlogsTool, followPodcastsTool, findPodcastsTool, listBlogsTool } from './onboarding-follow-tools';
import { downloadFreeBooksTool, findFreeBooksTool } from './onboarding-tools';

/**
 * Finding what is out there, outside the first run: the same directory, the
 * same free books and the same approval cards onboarding uses, offered in chat
 * and Compass to a build that declares them.
 *
 * Its own file because `onboarding-tools` already imports `tools`, so `tools`
 * cannot import these back.
 */
export const DISCOVERY_TOOL_DEFINITIONS = [
  findPodcastsTool,
  followPodcastsTool,
  listBlogsTool,
  followBlogsTool,
  findFreeBooksTool,
  downloadFreeBooksTool,
] as const;

export const DISCOVERY_CLIENT_TOOL_DEFINITIONS = DISCOVERY_TOOL_DEFINITIONS.map((tool) => tool.client());

export const DISCOVERY_TOOL_NAMES: ReadonlySet<string> = new Set(DISCOVERY_TOOL_DEFINITIONS.map((tool) => tool.name));

/**
 * How he recommends, on the cloud routes and only to a build with the tools.
 *
 * The check on the person follows lateral reading, what professional
 * fact-checkers do: leave the source's own site and see what others say of it.
 * The search budget is here because every search is on the reader's bill.
 */
export const SAMWELL_DISCOVERY_TOOL_PROMPT = `When you point them to a book, a show or a blog, you are vouching for it, so do the work a good friend would.

1. Start from them. What do they need right now, how much do they already know, how do they like to take things in, and how much time do they really have? Check their library first: the right answer may be a chapter they already own.
2. Look at the person, not the title. Use web_search and read_web_page to look outside the person's own site for what they have actually done in this field: direct experience, training, results, and what people who know the field say about them. Notice what they are selling, whether their claims rest on evidence, and whether the work has aged badly. Fame and audience size tell you nothing here.
3. Decide whether it is right for this person. Someone can be a real expert and still be wrong for them: too advanced, written for another situation, at odds with something they value.
4. Recommend one, two at most, and say why this one for them. Say what you checked and what you could not confirm. If the case is thin, say so plainly. If nothing good turned up, say that rather than offering something weak.

Two to four searches is usually enough, and each one costs them, so do not vet what they did not ask about. For a quick "know anything on this?", answer from what you know and offer to look properly. Never invent a credential, a study or a result, and only state what your sources support.

To act on it: find_podcasts and follow_podcasts for shows, list_blogs and follow_blogs for the blogs Open Citadel recommends, find_free_books and download_free_books for public-domain books. Each follow or download asks for their go-ahead. Any other book you can only name, so say where it can be found and that it can be brought in as an EPUB. You can only download public-domain books, so never let that decide what you recommend.`;
