import { useQuery } from '@tanstack/react-query';

import { createChatSessionsQueryOptions } from '@/query-manager/chat-sessions';
import type { ChatSession, SessionKind } from '@/services/chat-sessions';

const NO_SESSIONS: ChatSession[] = [];

/** A surface's past chats, from the query cache: read once, then kept. */
export function useChatSessionList(kind: SessionKind, enabled = true): ChatSession[] {
  return useQuery({ ...createChatSessionsQueryOptions(kind), enabled }).data ?? NO_SESSIONS;
}
