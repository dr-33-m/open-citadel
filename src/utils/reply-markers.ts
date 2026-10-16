/**
 * The marker protocol Samwell writes into a reply, and the reply without it.
 *
 *   [[ref:highlight:hl-123]] / [[ref:thought:th-123]]  an existing entry, read-only
 *   [[suggest:highlight:sugg-1]] / [[suggest:thought:sugg-1]]  a proposal, approve/reject
 *   [[book:bk-123]]  a book from the library, shown with its cover
 *
 * One pattern for drawing a reply (`AssistantContent` puts a card where each
 * marker is) and for copying one, so the two never disagree about what a
 * marker looks like.
 */

/** A fresh global pattern: `exec` keeps its place in `lastIndex`, so one is never shared. */
export function replyMarkerPattern(): RegExp {
  return /\[\[(?:(ref|suggest):(highlight|thought)|(book)):([^\]]+)\]\]/g;
}

/**
 * A reply as text to paste somewhere else: the markers dropped (they mean
 * nothing outside the app, and the reply already names what each one shows),
 * the gaps they leave closed up. Markdown is kept, as ChatGPT's copy keeps it.
 */
export function plainReply(content: string): string {
  return content
    .replace(replyMarkerPattern(), '')
    // Inside a line only: leading spaces are a nested list's indent.
    .replace(/(\S)[ \t]{2,}/g, '$1 ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
