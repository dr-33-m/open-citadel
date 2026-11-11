/**
 * The words for how a summary-only blog is read (`WholePosts`). Pure.
 *
 * Asked once per blog, the first time one of its posts is opened, and shown
 * after that on the blog's page, where it can be changed.
 */
import type { WholePosts } from '@/db/schema';

export type WholePostsState = {
  mode: WholePosts | null;
  /** The publisher has not asked that its pages not be fetched. */
  allowed: boolean;
  /** `aeon.co`. */
  host: string;
};

/** `site` draws the globe, `reader` the open book: the same marks as the two choices. */
export type WholePostsLine = { text: string; canChange: boolean; mark: 'site' | 'reader' };

/** The blog page's line about where its posts are read. */
export function wholePostsLine({ mode, allowed, host }: WholePostsState): WholePostsLine {
  if (!allowed) return { text: `Posts open on ${host}, as its publisher asks`, canChange: false, mark: 'site' };
  if (mode === 'app') return { text: 'Whole posts are fetched into the reader', canChange: true, mark: 'reader' };
  if (mode === 'site') return { text: `Posts open on ${host}`, canChange: true, mark: 'site' };
  return { text: 'Shares the opening of each post', canChange: true, mark: 'reader' };
}

export type WholePostsChoiceCopy = { title: string; detail: string };

export type WholePostsAskCopy = {
  kicker: string;
  title: string;
  line: string;
  site: WholePostsChoiceCopy;
  app: WholePostsChoiceCopy;
  note: string;
};

/** The sheet that asks: on opening a post (`onPage` false), or from the blog's page, where the note would point at itself. */
export function wholePostsAsk(blogTitle: string, host: string, onPage = false): WholePostsAskCopy {
  return {
    kicker: blogTitle.toUpperCase(),
    title: 'Shares the opening of each post',
    line: 'Its feed carries the first lines. Choose where you read the rest.',
    site: { title: `On ${host}`, detail: 'As it was published, in the browser.' },
    app: { title: 'In the reader', detail: `Fetched from ${host} as you open each post, for highlights, notes and Samwell.` },
    note: onPage ? 'Saved on this phone only.' : "Saved on this phone only. Change this on the blog's page.",
  };
}
