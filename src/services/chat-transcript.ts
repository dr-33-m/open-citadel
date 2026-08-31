/**
 * What counts as a visible turn in a chat transcript.
 *
 * A session's rows carry more than the conversation the reader sees: the
 * system priming turn, raw tool output, and the assistant's tool-call
 * requests. Every surface that renders a transcript has to hide the same
 * three, so the rule lives here rather than being restated at each call site.
 */

export interface TranscriptMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

/**
 * Marks an assistant row that holds a tool call rather than prose.
 *
 * Deliberately free of NUL bytes. The original marker wrapped the label in
 * `\0`, which does not survive a SQLite text round-trip intact on every
 * driver — the row came back with the marker gone, stopped matching the
 * filter, and rendered as an empty bubble above each reply once a session was
 * reopened from the database.
 */
export const TOOL_CALL_PREFIX = '@@TOOL_CALL@@';

/** The NUL-wrapped marker used before that, still present in stored rows. */
export const LEGACY_TOOL_CALL_PREFIX = '\0TOOL_CALL\0';

export function isToolCallMessage(content: string): boolean {
  return content.startsWith(TOOL_CALL_PREFIX) || content.startsWith(LEGACY_TOOL_CALL_PREFIX);
}

/** Strips the marker from a tool-call row, leaving the JSON payload. */
export function toolCallPayload(content: string): string {
  if (content.startsWith(TOOL_CALL_PREFIX)) return content.slice(TOOL_CALL_PREFIX.length);
  if (content.startsWith(LEGACY_TOOL_CALL_PREFIX)) return content.slice(LEGACY_TOOL_CALL_PREFIX.length);
  return content;
}

export function isVisibleChatMessage(m: TranscriptMessage): boolean {
  if (m.role === 'system' || m.role === 'tool') return false;
  if (isToolCallMessage(m.content)) return false;
  // Catches legacy tool-call rows whose marker was lost in storage, and any
  // other blank row: an empty bubble is never something worth rendering.
  return m.content.trim().length > 0;
}
