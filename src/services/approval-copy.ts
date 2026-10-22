import { approve, stringField, type ApprovalCopy } from '@/services/approval-copy/base';
import { onboardingApprovalCopy } from '@/services/onboarding-tools/approval';
import type { PendingApproval } from '@/stores/approval';
import { useCompassStore } from '@/stores/compass';

/**
 * What an approval asks, in the user's terms rather than the model's.
 *
 * Here rather than inside the sheet because there are now two things that ask
 * the question. The modal is right on top of a chat somebody is already in;
 * onboarding puts the same question inline, as a card in the transcript, since
 * a system dialog on somebody's first ninety seconds with an app reads as an
 * error rather than a choice.
 *
 * Two surfaces, one wording. The two chat surfaces in this app have already
 * grown divergent copies of a shared decision twice, and "what is Samwell
 * about to do to your files" is the last decision that should be phrased two
 * ways.
 */

export type { ApprovalCopy } from '@/services/approval-copy/base';

function bookCountFrom(input: unknown): number {
  const titles =
    input && typeof input === 'object' ? (input as { book_titles?: unknown }).book_titles : undefined;
  return Array.isArray(titles) && titles.length > 0 ? titles.length : 1;
}

/**
 * What a log is about to write, in the user's terms rather than the model's.
 *
 * The tool call carries a trackable id, and confirming "log tr_k3f9x2?" asks
 * someone to vouch for something they cannot read. The title comes from the
 * same store the deck reads, so the sheet and the card cannot disagree about
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

export function approvalCopy({ toolName, input }: PendingApproval): ApprovalCopy {
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

  // Onboarding's own, which name the shows and blogs being followed.
  const onboarding = onboardingApprovalCopy(toolName, input);
  if (onboarding) return onboarding;

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
        'Remove from Continue Reading?',
        `Samwell wants to remove ${bookWord} from Continue Reading.`,
      );
    case 'add_to_queue':
      return approve('Add to queue?', `Samwell wants to add ${bookWord} to your reading queue.`);
    case 'remove_from_queue':
      return approve('Remove from queue?', `Samwell wants to remove ${bookWord} from your reading queue.`);
    case 'reorder_queue':
      return approve('Reorder queue?', `Samwell wants to move ${bookWord} in your reading queue.`);
    case 'toggle_favorite': {
      const favorite = input && typeof input === 'object' ? (input as { favorite?: unknown }).favorite : undefined;
      if (favorite === true) return approve('Add to favorites?', `Samwell wants to add ${bookWord} to your favorites.`);
      if (favorite === false) return approve('Remove from favorites?', `Samwell wants to take ${bookWord} out of your favorites.`);
      return approve('Update favorites?', `Samwell wants to update favorites for ${bookWord}.`);
    }
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
        `Samwell wants to move ${bookWord} into Continue Reading.`,
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
    case 'add_note_to_highlight': {
      // The words themselves, so what is approved is what gets written.
      const text = stringField(input, 'text');
      return approve('Add this note?', text ? `Samwell wants to write this note: "${text}"` : 'Samwell wants to write a note on a highlight.');
    }
    case 'update_note': {
      const text = stringField(input, 'text');
      return approve(
        'Rewrite this note?',
        text ? `Samwell wants the note to say: "${text}"` : "Samwell wants to replace a note's text with something new.",
      );
    }
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
