import { queryOptions } from '@tanstack/react-query';

import { chatSessionKeys } from '@/query-manager/chat-sessions/keys';
import { listSessions, type SessionKind } from '@/services/chat-sessions';

export function createChatSessionsQueryOptions(kind: SessionKind) {
  return queryOptions({
    queryKey: chatSessionKeys.list(kind),
    queryFn: async () => listSessions(kind),
    staleTime: Infinity,
    // Long past any sheet closing: the list goes unwatched whenever the Samwell
    // page is put away, and opening it again should not read it again.
    gcTime: Infinity,
    networkMode: 'always',
    retry: false,
  });
}
