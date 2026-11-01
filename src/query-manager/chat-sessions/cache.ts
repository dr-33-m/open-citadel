import { queryClient } from '@/lib/query-client';
import { chatSessionKeys } from '@/query-manager/chat-sessions/keys';
import { listSessions, type ChatSession, type SessionKind } from '@/services/chat-sessions';

/*
 * The list for the stores, outside React. SQLite answers synchronously, so a
 * store that has just written gets the new list on the next line, as it did
 * when the list lived in the store. The query cache is still the one copy.
 */

/** Read the list again after a write, and tell whoever is drawing it. */
export function refreshChatSessions(kind: SessionKind): ChatSession[] {
  const sessions = listSessions(kind);
  queryClient.setQueryData<ChatSession[]>(chatSessionKeys.list(kind), sessions);
  return sessions;
}

/** The list as it stands, read now if nothing has asked for it yet. */
export function cachedChatSessions(kind: SessionKind): ChatSession[] {
  return queryClient.getQueryData<ChatSession[]>(chatSessionKeys.list(kind)) ?? refreshChatSessions(kind);
}

/** One change to the list that needs no second read of the database. */
export function updateCachedChatSessions(kind: SessionKind, change: (sessions: ChatSession[]) => ChatSession[]): void {
  queryClient.setQueryData<ChatSession[]>(chatSessionKeys.list(kind), (sessions) => change(sessions ?? []));
}
