import React from 'react';
import { Undo2 } from '@/components/icons';

import { defaultLogValue } from '@/services/measurement';
import type { DueItem } from '@/services/occurrences';
import { useCompassStore } from '@/stores/compass';
import { useSamwellSessionStore } from '@/stores/samwell-session';
import { useToast } from '@/components/toast/toast-provider';
import { haptics } from '@/utils/haptics';

type PendingNote = { item: DueItem; outcome: 'done' | 'missed'; value: number | null };

/**
 * Everything the log deck needs to actually log something.
 *
 * The components stay presentational and this does the reaching — narrow store
 * selectors, the session-scoped skip set, the note sheet in flight, the
 * haptics, and the undo.
 */
export function useLogDeck() {
  const { showToast } = useToast();
  const due = useCompassStore((s) => s.due);
  const logDone = useCompassStore((s) => s.logDone);
  const logMissed = useCompassStore((s) => s.logMissed);
  const undoLastLog = useCompassStore((s) => s.undoLastLog);

  const skipped = useSamwellSessionStore((s) => s.skippedTrackableIds);
  const setSession = useSamwellSessionStore((s) => s.set);

  /**
   * Whether the deck is showing what was snoozed rather than what is due.
   *
   * "Later" used to be a one-way door: the card left the deck and there was
   * nowhere to get it back from, so a snooze was indistinguishable from a
   * silent miss by the end of the day. The clock in the sheet header is the
   * way back in.
   */
  const [wantsSnoozed, setWantsSnoozed] = React.useState(false);
  const [values, setValues] = React.useState<Record<string, number | null>>({});
  const [pending, setPending] = React.useState<PendingNote | null>(null);
  /*
   * The note lives in the field's native buffer, and this only mirrors it out.
   *
   * A ref rather than state, because state here is the input bug the rest of
   * the app's sheet fields have already been fixed for: a controlled field
   * re-sets itself from JS on every commit, and a keystroke that lands while
   * the JS thread is busy — this one re-renders the whole deck sheet per
   * letter — gets committed over by a stale string, so the letter drops or the
   * IME re-inserts it and the word duplicates. Nothing renders from the note,
   * so nothing needs the re-render either.
   */
  const note = React.useRef('');
  const setNote = React.useCallback((next: string) => {
    note.current = next;
  }, []);

  /**
   * One commit per answered card, whatever fires it.
   *
   * `setPending(null)` only clears on the next render, so two calls in the
   * same tick both still see a pending item in their closure and both write.
   * That is not hypothetical: a save followed by the panel's own dismissal
   * did exactly this and put TWO rows in the log for one tap. A ref settles
   * it synchronously, and a duplicate row in these numbers is the one bug
   * this feature cannot afford.
   */
  const committing = React.useRef(false);

  const pendingItems = React.useMemo(
    () => due.filter((item) => !skipped.includes(item.trackable.id)),
    [due, skipped],
  );
  const snoozedItems = React.useMemo(
    () => due.filter((item) => skipped.includes(item.trackable.id)),
    [due, skipped],
  );
  // Derived, not synced. Emptying the snooze pile has to drop the view back to
  // today, and doing that in an effect means a second render pass where the
  // deck is briefly showing an empty snoozed list — so it is a condition, not
  // a state update chasing another state update.
  const showingSnoozed = wantsSnoozed && snoozedItems.length > 0;
  const items = showingSnoozed ? snoozedItems : pendingItems;

  const changeValue = React.useCallback((trackableId: string, next: number | null) => {
    setValues((prev) => ({ ...prev, [trackableId]: next }));
  }, []);

  /** The value to write: what the user set, or the control's own opening value. */
  const resolveValue = React.useCallback(
    (item: DueItem): number | null => {
      const set = values[item.trackable.id];
      return set !== undefined ? set : defaultLogValue(item.trackable.measurement);
    },
    [values],
  );

  // Both outcomes go through the note sheet. A note on a win is journal
  // material too, and SKIP THE NOTE keeps that from costing anything.
  const done = React.useCallback(
    (item: DueItem) => {
      haptics.commit();
      note.current = '';
      setPending({ item, outcome: 'done', value: resolveValue(item) });
    },
    [resolveValue],
  );

  const missed = React.useCallback((item: DueItem) => {
    haptics.warn();
    note.current = '';
    setPending({ item, outcome: 'missed', value: null });
  }, []);

  const unsnooze = React.useCallback(
    (trackableId: string) => {
      setSession({ skippedTrackableIds: skipped.filter((id) => id !== trackableId) });
    },
    [setSession, skipped],
  );

  const skip = React.useCallback(
    (item: DueItem) => {
      // Nothing is written. "Not now" is not a claim about what happened, and
      // recording it would put it in the consistency maths where it does not
      // belong. It comes back tomorrow.
      setSession({ skippedTrackableIds: [...skipped, item.trackable.id] });
      // And stay on TODAY. Snoozing is a way of getting a card OUT of the way,
      // so following it into the snooze pile is the opposite of what was
      // asked for — the card should just leave and the next one come up. The
      // clock in the header is how you go and look at them, deliberately.
      setWantsSnoozed(false);
    },
    [setSession, skipped],
  );

  const commit = React.useCallback(
    async (withNote: string | null) => {
      if (!pending || committing.current) return;
      committing.current = true;
      const { item, outcome, value } = pending;
      setPending(null);
      note.current = '';
      if (skipped.includes(item.trackable.id)) unsnooze(item.trackable.id);

      if (outcome === 'done') {
        await logDone(item.trackable.id, value, withNote);
      } else {
        await logMissed(item.trackable.id, withNote);
      }

      // A deck that commits on one tap needs an undo, or a mis-tap becomes a
      // permanent lie in a number about the reader's own discipline.
      //
      // Only a completion gets the tick. Admitting a miss worked too, but a
      // green tick over it would read as praise for the wrong thing, and a
      // warning would scold someone for being honest — so it stays plain.
      showToast({
        tone: outcome === 'done' ? 'success' : 'default',
        message: outcome === 'done' ? 'Logged.' : 'Logged as missed.',
        actionIcon: Undo2,
        actionLabel: 'Undo',
        onActionPress: () => {
          void undoLastLog();
        },
      });
      committing.current = false;
    },
    [pending, logDone, logMissed, undoLastLog, skipped, unsnooze, showToast],
  );

  return {
    items,
    snoozedCount: snoozedItems.length,
    showingSnoozed,
    toggleSnoozed: () => setWantsSnoozed((v) => !v),
    /**
     * Back to today's cards.
     *
     * The deck's sheet stays mounted between openings, so without this a visit
     * to the snooze pile was still the view you were in the next time you
     * opened the deck — hours later, with a different set of cards due.
     */
    showToday: () => setWantsSnoozed(false),
    unsnoozeItem: (item: DueItem) => unsnooze(item.trackable.id),
    values,
    changeValue,
    done,
    missed,
    skip,
    pending,
    setNote,
    saveNote: () => void commit(note.current.trim() || null),
    skipNote: () => void commit(null),
  };
}
