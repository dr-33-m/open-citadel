import React from 'react';

import { ConfirmDialog, type DialogAction } from '@/components/ui/confirm-dialog';
import { useApprovalStore, type PendingApproval } from '@/stores/approval';
import { useChatStore } from '@/stores/chat';
import { useCompassChatStore } from '@/stores/compass-chat';
import { useCompassStore } from '@/stores/compass';

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

/**
 * What a log is about to write, in the user's terms rather than the model's.
 *
 * The tool call carries a trackable id, and confirming "log tr_k3f9x2?" asks
 * someone to vouch for something they cannot read. The title comes from the
 * same store the deck reads, so the dialog and the card cannot disagree about
 * what is being logged.
 */
function logApprovalCopy(input: unknown): ApprovalCopy {
  const trackableId = stringField(input, 'trackable_id');
  const trackable = useCompassStore
    .getState()
    .trackables.find((t) => t.id === trackableId);
  const title = trackable?.title ?? 'this';

  const outcome = stringField(input, 'outcome');
  const note = stringField(input, 'note');
  const date = stringField(input, 'date');
  const value =
    input && typeof input === 'object' && typeof (input as { value?: unknown }).value === 'number'
      ? String((input as { value: number }).value)
      : undefined;

  const when = date ? ` on ${date}` : ' today';
  const body =
    outcome === 'MISSED'
      ? `Samwell wants to record that ${title} did not happen${when}.${note ? ` Note: "${note}"` : ''}`
      : `Samwell wants to record ${title} as done${when}${value ? `, ${value}` : ''}.${
          note ? ` Note: "${note}"` : ''
        }`;

  return { title: 'Log this?', body, confirmLabel: 'LOG IT', destructive: false };
}

function getApprovalCopy({ toolName, input }: PendingApproval): ApprovalCopy {
  if (toolName === 'log_trackable') return logApprovalCopy(input);

  /*
   * Compass's own writes. Each one ends or reshapes something the user has
   * been running for weeks, so the copy names the consequence rather than the
   * action: what a pause does to consistency, what stopping keeps.
   */
  switch (toolName) {
    case 'finish_goal':
      return {
        title: 'Finish this goal?',
        body: 'Samwell wants to close this goal out as finished. It moves to your past goals.',
        confirmLabel: 'FINISH IT',
        destructive: false,
      };
    case 'stop_goal': {
      const reason = stringField(input, 'reason');
      return {
        title: 'Stop this goal?',
        body: `Samwell wants to retire this goal before its end.${
          reason ? ` Your reason: "${reason}"` : ''
        }`,
        confirmLabel: 'STOP IT',
        destructive: true,
      };
    }
    case 'set_primary_goal':
      return {
        title: 'Change your main goal?',
        body: 'Samwell wants to move the main-goal mark to a different goal.',
        confirmLabel: 'CHANGE IT',
        destructive: false,
      };
    case 'pause_trackable':
      return {
        title: 'Pause this activity?',
        body: 'Samwell wants to pause it. The days it stays paused will not count against your consistency.',
        confirmLabel: 'PAUSE IT',
        destructive: false,
      };
    case 'resume_trackable':
      return {
        title: 'Resume this activity?',
        body: 'Samwell wants to start it counting again from today.',
        confirmLabel: 'RESUME IT',
        destructive: false,
      };
  }

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
    case 'start_reading':
      return approve(
        'Start reading?',
        `Samwell wants to move ${bookWord} into Currently Reading.`,
      );
    case 'clear_queue':
      return approve(
        'Clear the queue?',
        'Samwell wants to empty your reading queue. The books stay in your library.',
      );
    case 'rename_book': {
      const newTitle = stringField(input, 'new_title') ?? 'something else';
      return approve('Rename this book?', `Samwell wants to retitle it to "${newTitle}".`);
    }
    case 'delete_book':
      // The one book action that takes other things with it, so it says so.
      return approve(
        'Delete from your library?',
        `Samwell wants to permanently delete ${bookWord}, along with its highlights, notes and reading progress. This can't be undone.`,
      );
    case 'delete_collection': {
      const name = stringField(input, 'collection_name') ?? 'a collection';
      return approve(
        'Delete this collection?',
        `Samwell wants to delete "${name}". The books in it stay in your library.`,
      );
    }
    case 'add_note_to_highlight':
      return approve('Add this note?', 'Samwell wants to write a note on a highlight.');
    case 'update_note':
      return approve(
        'Rewrite this note?',
        "Samwell wants to replace a note's text with something new.",
      );
    case 'delete_note':
      return approve(
        'Delete this note?',
        "Samwell wants to permanently delete a note. The highlight it is on stays. This can't be undone.",
      );
    case 'update_thought':
      return approve(
        'Rewrite this thought?',
        'Samwell wants to replace the words of a thought. Its colour and tags stay as they are.',
      );
    default:
      return approve('Approve this action?', 'Samwell wants to make a change.');
  }
}

export function ApprovalDialog() {
  const activeSessionId = useChatStore((s) => s.activeSession?.id);
  /*
   * Compass talks on its own thread, and its turn is on screen exactly while
   * it is in flight — there is no background Compass conversation to be
   * interrupted by. Without this the approval would sit in the store unseen
   * and the turn would hang until the client's settle timeout, which is the
   * shape of a hang rather than a question.
   */
  const compassRunning = useCompassChatStore((s) => s.submitting);
  const compassSessionId = useCompassChatStore((s) => s.activeSessionId);
  // Only ever show the approval that belongs to the conversation the user is
  // currently looking at — a tool call awaiting approval in a session they've
  // since navigated away from stays pending in the store, but must not float
  // over an unrelated screen.
  const pending = useApprovalStore((s) => {
    if (compassRunning && compassSessionId) {
      const compass = s.pendingBySession.get(compassSessionId)?.request ?? null;
      if (compass) return compass;
    }
    return activeSessionId ? (s.pendingBySession.get(activeSessionId)?.request ?? null) : null;
  });
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
