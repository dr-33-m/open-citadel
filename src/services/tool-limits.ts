/**
 * How much material a tool may hand back, by runtime.
 *
 * Offline and cloud Samwell run the same tools against the same library, but
 * what counts as a reasonable answer differs by orders of magnitude: a
 * 4096-token KV cache against a frontier model's 200k window. Keeping the
 * numbers here, as data, rather than inline in each query means the two
 * profiles can be read side by side and compared.
 *
 * Pure and dependency-free so the balance between them can be unit tested;
 * `chat-tools.ts` cannot be, since it reaches the database.
 */

export type ToolRuntime = 'device' | 'cloud';

/**
 * Ceiling for one tool result, in estimated tokens.
 *
 * On device this has to be tight: a single unbounded search serializes past
 * 900 tokens, most of the usable window in one go. In cloud the bound exists
 * only so a runaway library search cannot balloon a request, not to ration
 * context.
 *
 * Passed explicitly at every call site rather than defaulted, so the device
 * budget can never silently end up applied to a cloud turn.
 */
export const TOOL_RESULT_TOKEN_BUDGET: Record<ToolRuntime, number> = {
  device: 600,
  cloud: 8_000,
};

export interface SearchLimits {
  /** Rows matched on a query, tag or book title. */
  matched: number;
  /** Rows returned when the caller gave no filter at all. */
  recent: number;
  /** Secondary sweep over note text. */
  notes: number;
  /** Books listed for a recommendation. */
  library: number;
}

/**
 * Split by how much relevance signal a result carries, not by size alone.
 *
 * Matched rows earned their place, so a large window can afford plenty. Rows
 * returned with no filter matched nothing in particular — handing a frontier
 * model forty of those is noise wearing the costume of context, so that
 * ceiling stays low even where the window could hold it. Having room is not a
 * reason to fill it.
 */
export const SEARCH_LIMITS: Record<ToolRuntime, SearchLimits> = {
  device: { matched: 5, recent: 5, notes: 5, library: 60 },
  cloud: { matched: 40, recent: 12, notes: 15, library: 250 },
};

export interface ReadingLimits {
  maxSnippets: number;
  maxPerBook: number;
  /** Characters of context either side of a keyword hit. */
  window: number;
  /** How far back through finished books a search reaches. */
  finishedBooks: number;
  /** Ceiling on text extracted across the whole search. */
  totalChars: number;
}

export const READING_LIMITS: Record<ToolRuntime, ReadingLimits> = {
  device: { maxSnippets: 8, maxPerBook: 2, window: 220, finishedBooks: 5, totalChars: 40_000 },
  cloud: { maxSnippets: 24, maxPerBook: 6, window: 700, finishedBooks: 20, totalChars: 200_000 },
};
