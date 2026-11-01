import type { SessionKind } from '@/services/chat-sessions';

/** Each surface's past chats. Local: every write ends by refreshing its list. */
export const chatSessionKeys = {
  all: ['chat-sessions'] as const,
  list: (kind: SessionKind) => [...chatSessionKeys.all, kind] as const,
};
