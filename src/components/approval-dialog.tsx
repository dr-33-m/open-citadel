import React from 'react';

import { ConfirmDialog, type DialogAction } from '@/components/ui/confirm-dialog';
import { useApprovalStore, type PendingApproval } from '@/stores/approval';
import { useChatStore } from '@/stores/chat';

type ApprovalCopy = {
  title: string;
  body: string;
  confirmLabel: string;
  destructive: boolean;
};

function stringField(input: unknown, key: string): string | undefined {
  if (input && typeof input === 'object' && key in input) {
    const value = (input as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

function bookCountFrom(input: unknown): number {
  const titles =
    input && typeof input === 'object' ? (input as { book_titles?: unknown }).book_titles : undefined;
  return Array.isArray(titles) && titles.length > 0 ? titles.length : 1;
}

function approve(title: string, body: string): ApprovalCopy {
  return { title, body, confirmLabel: 'APPROVE', destructive: false };
}

function getApprovalCopy({ toolName, input }: PendingApproval): ApprovalCopy {
  if (toolName === 'delete_highlight' || toolName === 'delete_thought') {
    const entryType = toolName.endsWith('_highlight') ? 'highlight' : 'thought';
    return {
      title: `Delete ${entryType}?`,
      body: `Samwell wants to permanently delete this ${entryType}. This can't be undone.`,
      confirmLabel: 'DELETE',
      destructive: true,
    };
  }

  if (toolName === 'tag_highlight' || toolName === 'tag_thought') {
    const entryType = toolName.endsWith('_highlight') ? 'highlight' : 'thought';
    const tags =
      input && typeof input === 'object' && Array.isArray((input as { tags?: unknown }).tags)
        ? (input as { tags: string[] }).tags.join(', ')
        : 'these tags';
    return approve('Add tags?', `Samwell wants to add ${tags} to this ${entryType}.`);
  }

  const books = bookCountFrom(input);
  const bookWord = books === 1 ? 'a book' : `${books} books`;

  switch (toolName) {
    case 'remove_from_currently_reading':
      return approve(
        'Remove from Currently Reading?',
        `Samwell wants to remove ${bookWord} from Currently Reading.`,
      );
    case 'add_to_queue':
      return approve('Add to queue?', `Samwell wants to add ${bookWord} to your reading queue.`);
    case 'remove_from_queue':
      return approve('Remove from queue?', `Samwell wants to remove ${bookWord} from your reading queue.`);
    case 'reorder_queue':
      return approve('Reorder queue?', `Samwell wants to move ${bookWord} in your reading queue.`);
    case 'toggle_favorite':
      return approve('Update favorites?', `Samwell wants to update favorites for ${bookWord}.`);
    case 'mark_as_finished':
      return approve('Mark as finished?', `Samwell wants to mark ${bookWord} as finished.`);
    case 'create_collection': {
      const name = stringField(input, 'name') ?? 'a new collection';
      return approve('Create collection?', `Samwell wants to create a collection called "${name}".`);
    }
    case 'add_book_to_collection': {
      const collectionName = stringField(input, 'collection_name') ?? 'a collection';
      return approve('Add to collection?', `Samwell wants to add ${bookWord} to "${collectionName}".`);
    }
    case 'remove_book_from_collection': {
      const collectionName = stringField(input, 'collection_name') ?? 'a collection';
      return approve('Remove from collection?', `Samwell wants to remove ${bookWord} from "${collectionName}".`);
    }
    default:
      return approve('Approve this action?', 'Samwell wants to make a change.');
  }
}

export function ApprovalDialog() {
  const activeSessionId = useChatStore((s) => s.activeSession?.id);
  // Only ever show the approval that belongs to the session the user is
  // currently looking at — a tool call awaiting approval in a session they've
  // since navigated away from stays pending in the store, but must not float
  // over an unrelated screen.
  const pending = useApprovalStore((s) =>
    activeSessionId ? (s.pendingBySession.get(activeSessionId)?.request ?? null) : null,
  );
  const respondRaw = useApprovalStore((s) => s.respond);
  const respond = (approved: boolean, options?: { rememberForSession?: boolean }) => {
    if (pending) respondRaw(pending.sessionId, approved, options);
  };

  // The dialog's own tap-outside-to-cancel / hardware-back maps to decline
  // (`respond(false)`) — the same direction the old sheet's backdrop tap and
  // drag-to-dismiss both resolved to, so this isn't a new way to lose an
  // approval by accident.
  const copy = pending ? getApprovalCopy(pending) : null;

  // Dialog has no separate slot for a secondary, non-decision action, so
  // "allow for this session" rides along as a third, non-confirming entry in
  // `actions` — Dialog already pulls only the confirm/destructive action to
  // the right, so this still lands between CANCEL and the confirming button
  // rather than competing with either. Only offered for non-destructive
  // approvals, matching the original: a delete never gets a "remember this".
  const actions: DialogAction[] = copy
    ? [
        { label: 'CANCEL', onPress: () => respond(false) },
        ...(copy.destructive
          ? []
          : [
              {
                label: 'ALLOW FOR THIS SESSION',
                onPress: () => respond(true, { rememberForSession: true }),
              },
            ]),
        {
          label: copy.confirmLabel,
          onPress: () => respond(true),
          confirm: true,
          destructive: copy.destructive,
        },
      ]
    : [];

  return (
    <ConfirmDialog
      visible={pending != null}
      title={copy?.title ?? ''}
      message={copy?.body}
      actions={actions}
      onClose={() => respond(false)}
    />
  );
}
