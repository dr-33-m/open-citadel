import React from 'react';

import { BookOpen, MicSignal, Newspaper, type LucideIcon } from '@/components/icons';
import type { ToolboxItem } from '@/components/samwell/samwell-toolbox';
import type { BookKind } from '@/db/schema';
import { attachmentTool } from '@/features/chat/utils/attachment-tools';

/**
 * The kinds of thing a chat can hold, in the order the drawer shows them. A
 * new kind is a row here and a picker, never another copy of the rules.
 */
const ATTACHMENT_KINDS: { kind: BookKind; id: string; icon: LucideIcon; label: string; lead?: boolean }[] = [
  // The book leads: it is what the chat page is mostly for.
  { kind: 'book', id: 'book', icon: BookOpen, label: 'Book', lead: true },
  { kind: 'article', id: 'post', icon: Newspaper, label: 'Blog post' },
  { kind: 'episode', id: 'episode', icon: MicSignal, label: 'Podcast' },
];

export type ChatToolboxArgs = {
  hasSession: boolean;
  /** What the chat holds: the session's kind, or the pick waiting for the first message. */
  attachedKind: BookKind | null;
  pendingKind: BookKind | null;
  /** Its title, drawn as the attached tool's detail. */
  attachedTitle: string | null;
  /** Its cover, drawn in place of the attached tool's icon. */
  attachedCover: string | null;
  busy: boolean;
  /** Opens each kind's picker, over the drawer. */
  pickers: Record<BookKind, () => void>;
  /** Drops the waiting pick. */
  onDrop: () => void;
};

/**
 * The drawer's Reading tools: Book, Blog post and Podcast from one table.
 * Memoised, because the Samwell page re-renders on every streamed token and
 * this drawer is shut most of that time.
 */
export function useChatToolbox(args: ChatToolboxArgs): ToolboxItem[] {
  const { hasSession, attachedKind, pendingKind, attachedTitle, attachedCover, busy, pickers, onDrop } = args;

  return React.useMemo(() => {
    const state = { hasSession, attachedKind, pendingKind, busy };
    const attachments = ATTACHMENT_KINDS.flatMap(({ kind, ...row }): ToolboxItem[] => {
      const tool = attachmentTool(kind, state);
      if (!tool.shown) return [];
      return [
        {
          ...row,
          // In a chat that holds nothing, a pick starts a new chat about it.
          detail: tool.attached ? attachedTitle : tool.startsNew ? 'New chat' : 'None yet',
          // The cover stands in for the icon once one is picked: the whole
          // answer to "what is Samwell reading with me", without a line of text.
          image: tool.attached ? attachedCover : null,
          active: tool.attached,
          onPress: tool.pickable ? pickers[kind] : undefined,
          // Long-press drops it, only before the first message: after that it is fixed context.
          onLongPress: tool.droppable ? onDrop : undefined,
        },
      ];
    });
    return attachments;
  }, [attachedCover, attachedKind, attachedTitle, busy, hasSession, onDrop, pendingKind, pickers]);
}
