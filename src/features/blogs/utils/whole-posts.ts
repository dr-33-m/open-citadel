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
  if (mode === 'app') return { text: 'Posts open in the reader', canChange: true, mark: 'reader' };
  if (mode === 'site') return { text: `Posts open on ${host}`, canChange: true, mark: 'site' };
  return { text: 'Previews only. Choose where posts open', canChange: true, mark: 'reader' };
}

/** `Aeon's`, and `Paul Graham Essays'` rather than `Essays's`. */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
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
    title: `Where should ${possessive(blogTitle)} posts open?`,
    line: `${blogTitle} only sends the first few lines of each post.`,
    site: { title: `On ${host}`, detail: 'As it was published, in your browser.' },
    app: { title: 'In the reader', detail: `Brought in from ${host} when you open a post, so you can highlight, take notes and ask Samwell.` },
    note: onPage ? 'Saved on this phone only.' : `Saved on this phone only. Change this on ${possessive(blogTitle)} page.`,
  };
}
