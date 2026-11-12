/** What a blog's feed says, as plain objects. */

export type ParsedArticle = {
  /** The feed's own id for the post, when it gives one. */
  guid: string | null;
  /** The post on the web. Articles without one cannot be opened or deduplicated, and are dropped. */
  link: string;
  title: string;
  author: string | null;
  /** The post as the feed carries it: the whole thing, or only a summary. */
  contentHtml: string | null;
  /** True when that is only the opening of the post (`feedExcerpt`). */
  excerpt: boolean;
  /** Plain text, at most `SUMMARY_LENGTH` characters, for a row in a list. */
  summary: string | null;
  imageUrl: string | null;
  /** ISO 8601. A date in the future is read as now; a post with no date is dated now. */
  publishedAt: string;
};

export type ParsedBlog = {
  type: 'rss' | 'atom' | 'rdf';
  title: string;
  /** The blog's home page. */
  siteUrl: string | null;
  description: string | null;
  imageUrl: string | null;
  language: string | null;
  /** The feed's copyright line, as plain text. */
  rights: string | null;
  articles: ParsedArticle[];
};
