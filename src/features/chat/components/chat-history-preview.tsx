import React from 'react';

import { ChatHistoryRowBody } from '@/features/chat/components/chat-history-row-body';
import { Item } from '@/components/ui/item';
import type { ChatSession } from '@/services/chat-sessions';

/** More than the sheet shows at once. */
const ROWS = 8;

/**
 * The first past chats, drawn as the sheet rises. The list itself waits for the
 * rise to end, because each of its rows is a swipe gesture and three animated
 * styles. These are the same words with none of that, so the chats are simply
 * there, and the real rows take over under the same pixels.
 */
export function ChatHistoryPreview({
  sessions,
  primary,
  muted,
}: {
  sessions: readonly ChatSession[];
  primary: string;
  muted: string;
}) {
  return (
    <>
      {sessions.slice(0, ROWS).map((item, index) => (
        <React.Fragment key={item.id}>
          {index > 0 ? <Item.Separator /> : null}
          <Item className="py-3">
            <ChatHistoryRowBody item={item} primary={primary} muted={muted} />
          </Item>
        </React.Fragment>
      ))}
    </>
  );
}
