import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { books, chatMessages, chatSessions, chatSuggestions } from '@/db/schema';
import { isToolCallMessage } from '@/services/chat-transcript';

/**
 * Chat sessions, shared by both surfaces.
 *
 * A Compass conversation is a chat: a transcript, a title, a place in history,
 * something to come back to. It differs from a reading chat by what Samwell is
 * focused on, not by how it is stored, so it lives in the same two tables and
 * is told apart by `kind`.
 *
 * This module is the one place that knows how those tables are read and
 * written. The reading store's own `createSession` stays where it is, because
 * seeding a book chat is genuinely reading-specific work: the spoiler
 * boundary, the passage context, the read-so-far excerpt. Everything that is
 * the same for both — listing, reading a transcript, appending, renaming,
 * deleting — is here, so the two cannot drift into disagreeing about what a
 * session is.
 */

export type SessionKind = 'reading' | 'compass';

export type ChatSession = {
  id: string;
  bookId: string | null;
  bookTitle: string | null;
  title: string;
  contextText: string | null;
  contextLocator: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessage: string | null;
};

export type ChatMessage = {
  id: string;
  sessionId: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  createdAt: string;
};

/**
 * Every session of one kind, newest first, each with the last thing said in
 * it.
 *
 * Filtered by kind rather than listing everything, which is what keeps a
 * Compass conversation out of the reading history sheet and the other way
 * round. The two histories answer different questions and mixing them would
 * make both worse.
 */
export function listSessions(kind: SessionKind): ChatSession[] {
  const rows = db
    .select({
      id: chatSessions.id,
      bookId: chatSessions.bookId,
      bookTitle: books.title,
      title: chatSessions.title,
      contextText: chatSessions.contextText,
      contextLocator: chatSessions.contextLocator,
      createdAt: chatSessions.createdAt,
      updatedAt: chatSessions.updatedAt,
    })
    .from(chatSessions)
    .leftJoin(books, eq(chatSessions.bookId, books.id))
    .where(eq(chatSessions.kind, kind))
    .orderBy(desc(chatSessions.updatedAt))
    .all();

  const previews = lastMessages();

  return rows.map((row) => ({
    id: row.id,
    bookId: row.bookId ?? null,
    bookTitle: row.bookTitle ?? null,
    title: row.title,
    contextText: row.contextText ?? null,
    contextLocator: row.contextLocator ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastMessage: previews.get(row.id) ?? null,
  }));
}

/** How much of the last message a history row shows. */
const PREVIEW_CHARS = 80;

/**
 * The last thing actually said in each session, as one query.
 *
 * This used to be a query per session, run inside the map: opening the history
 * sheet with forty conversations meant forty round trips on the JS thread, and
 * it ran again after every message sent. A window function does it once.
 *
 * It also filters properly. The old version took the single newest row and
 * dropped it only if it was a system message, so a session whose last row was
 * raw tool output or an `@@TOOL_CALL@@` request showed that as its preview,
 * and a session that ended on a system row showed nothing at all rather than
 * the last real turn.
 */
function lastMessages(): Map<string, string> {
  const rows = db.all<{ session_id: string; content: string }>(sql`
    SELECT session_id, content FROM (
      SELECT
        session_id,
        content,
        ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at DESC) AS rn
      FROM chat_messages
      WHERE role IN ('user', 'assistant')
    )
    WHERE rn = 1
  `);

  const previews = new Map<string, string>();
  for (const row of rows) {
    // A tool-call row is an assistant row carrying JSON, not something anybody
    // said. Rare as a last message, and unreadable when it happens.
    if (isToolCallMessage(row.content)) continue;
    const text = row.content.trim();
    if (text) previews.set(row.session_id, text.slice(0, PREVIEW_CHARS));
  }
  return previews;
}

/** One session's transcript, oldest first. */
export function readMessages(sessionId: string): ChatMessage[] {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(chatMessages.createdAt)
    .all()
    .map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      role: row.role as ChatMessage['role'],
      content: row.content,
      createdAt: row.createdAt,
    }));
}

export function appendMessage(message: ChatMessage): void {
  db.insert(chatMessages).values(message).run();
}

/**
 * Move a session to the top of its history.
 *
 * The list orders by `updatedAt`, so without this a conversation you spoke in
 * five minutes ago sits below one you have not opened in a week.
 */
export function touchSession(sessionId: string, at = new Date().toISOString()): void {
  db.update(chatSessions).set({ updatedAt: at }).where(eq(chatSessions.id, sessionId)).run();
}

export function renameSession(sessionId: string, title: string): void {
  db.update(chatSessions).set({ title }).where(eq(chatSessions.id, sessionId)).run();
}

/**
 * Delete a session and everything hanging off it.
 *
 * Explicit deletes rather than relying on the cascade, because the same call
 * has to work on a device whose `chat_suggestions` foreign key predates the
 * cascade being declared.
 */
export function removeSession(sessionId: string): void {
  db.delete(chatMessages).where(eq(chatMessages.sessionId, sessionId)).run();
  db.delete(chatSuggestions).where(eq(chatSuggestions.sessionId, sessionId)).run();
  db.delete(chatSessions).where(eq(chatSessions.id, sessionId)).run();
}

/**
 * Whether nobody has actually said anything in this session.
 *
 * Counts user and assistant turns only. A reading session is seeded with a
 * system message the moment it is created, so "has rows" would call an
 * untouched chat used.
 */
export function isEmptySession(sessionId: string): boolean {
  const rows = db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.sessionId, sessionId),
        inArray(chatMessages.role, ['user', 'assistant']),
      ),
    )
    .all();
  return rows.length === 0;
}
