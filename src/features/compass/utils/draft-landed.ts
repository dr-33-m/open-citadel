import type { CompassDraft } from '@/stores/samwell-session';

/**
 * What a toast says when a card Samwell proposed has been approved and
 * written. Pure.
 *
 * Approving used to make the card vanish and nothing else, so the one moment
 * a goal begins passed without a word: the reader had to open the drawer to
 * find out it had worked.
 */
export function draftLandedMessage(draft: NonNullable<CompassDraft>): string {
  if (draft.kind === 'plan') return `Goal started: ${draft.proposal.title}`;
  const count = draft.draft.adjustments.length;
  if (count === 0) return 'Noted';
  return count === 1 ? 'Change saved' : `${count} changes saved`;
}

/**
 * The status line an approved card keeps in place of its buttons, or null
 * while it is still waiting for an answer. Pure.
 */
export function draftDoneLabel(draft: CompassDraft): string | null {
  if (!draft?.applied) return null;
  if (draft.kind === 'plan') return 'GOAL STARTED';
  return draft.draft.adjustments.length > 0 ? 'CHANGES SAVED' : 'NOTE KEPT';
}

/** What the toast says when the write did not land. The card stays, so it can be tried again. */
export const DRAFT_FAILED_MESSAGE = 'That did not save. Try again.';
