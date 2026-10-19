/**
 * What the composer's attachment tools (Book, Blog post, Podcast) do, decided
 * once for all three. Pure.
 *
 * A chat holds one thing, a book, a post or an episode, and each has its own
 * tool. Before the first message any of them can be picked, in place of
 * whatever was; once a session exists, what it holds is fixed context, so
 * only the tool for that is shown, lit and inert.
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

export type AttachmentTool = { shown: boolean; attached: boolean; pickable: boolean; droppable: boolean };

export function attachmentTool(kind: BookKind, state: AttachmentState): AttachmentTool {
  const open = !state.hasSession && !state.busy;
  return {
    shown: !state.hasSession || state.attachedKind === kind,
    attached: state.attachedKind === kind,
    pickable: open,
    droppable: open && state.pendingKind === kind,
  };
}
