/**
 * What the composer's attachment tools (Book, Blog post, Podcast) do, decided
 * once for all three. Pure.
 *
 * A chat holds one thing, a book, a post or an episode, and each has its own
 * tool. Before the first message any of them can be picked, in place of
 * whatever was; once a session exists, what it holds is fixed context, so
 * only the tool for that is shown, lit and inert.
 *
 * A chat that started holding nothing keeps all three, and picking one starts
 * a new chat about it (`startsNew`). Otherwise the drawer's Reading tab would
 * be empty for most conversations, and the way to talk about a book would be
 * hidden behind New chat.
 */
import type { BookKind } from '@/db/schema';

export type AttachmentState = {
  /** A conversation exists: what it holds is fixed. */
  hasSession: boolean;
  /** What the chat holds, from the session, or from the pick waiting for the first message. */
  attachedKind: BookKind | null;
  /** The pick waiting for the first message, if any: the one that long press drops. */
  pendingKind: BookKind | null;
  /** A reply streaming, or a chat being switched to. */
  busy: boolean;
};

export type AttachmentTool = { shown: boolean; attached: boolean; pickable: boolean; droppable: boolean; startsNew: boolean };

export function attachmentTool(kind: BookKind, state: AttachmentState): AttachmentTool {
  const open = !state.hasSession && !state.busy;
  const startsNew = state.hasSession && state.attachedKind == null;
  return {
    shown: !state.hasSession || startsNew || state.attachedKind === kind,
    attached: state.attachedKind === kind,
    pickable: (open || startsNew) && !state.busy,
    droppable: open && state.pendingKind === kind,
    startsNew,
  };
}
