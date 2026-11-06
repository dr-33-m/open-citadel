/**
 * What the screen of Samwell's notes draws, and in what order. Pure: the words
 * and the grouping are decided here, and the components render them.
 */
import { formatPubDate } from '@/utils/pub-date';

export type MemoryNoteInput = {
  id: string;
  kind: string;
  text: string;
  resolvedAt: string | null;
  createdAt: string;
  sourceSessionId: string | null;
  sourceTitle: string | null;
};

export type MemoryProfileInput = { text: string; updatedAt: string };

/** One note as it is drawn and as its menu needs it. */
export type MemoryNoteView = {
  id: string;
  text: string;
  /** When, and the chat it came from: "Yesterday · TikTok pitch". */
  meta: string;
  sourceSessionId: string | null;
};

/** How a kind of note is marked on the timeline: progress green, strain amber, a promise blue. */
export type MemoryTone = 'default' | 'success' | 'warning' | 'info';

/** One note on the timeline, with what is drawn beside it. */
export type MemoryEvent = {
  note: MemoryNoteView;
  /** What kind of thing he noted: "WIN", "WORKING THROUGH". */
  label: string;
  tone: MemoryTone;
  /**
   * Where it sits, above the note: the day where it changes from the note
   * above, and the chat it came from where that changes or a new day starts.
   * Null when neither changes.
   */
  context: string | null;
  /** The bottom of the timeline, where its rail stops. */
  last: boolean;
};

export type MemoryRow =
  | { type: 'portrait'; key: string; text: string; updated: string }
  | { type: 'heading'; key: string; title: string }
  | ({ type: 'event'; key: string } & MemoryEvent);

/** Each kind's label and tone. A kind not listed is about them. */
const KINDS: Record<string, { label: string; tone: MemoryTone }> = {
  win: { label: 'WIN', tone: 'success' },
  milestone: { label: 'MILESTONE', tone: 'success' },
  goal_finished: { label: 'GOAL REACHED', tone: 'success' },
  struggle: { label: 'WORKING THROUGH', tone: 'warning' },
  commitment: { label: 'SAID THEY WOULD', tone: 'info' },
  recommended: { label: 'HE POINTED YOU TO', tone: 'default' },
  book_finished: { label: 'FINISHED A BOOK', tone: 'success' },
  book_removed: { label: 'PUT A BOOK DOWN', tone: 'default' },
};
const ABOUT = { label: 'ABOUT YOU', tone: 'default' } as const;

/** A note's label and tone. A promise kept reads as kept, in green. */
export function noteKind(note: Pick<MemoryNoteInput, 'kind' | 'resolvedAt'>): { label: string; tone: MemoryTone } {
  if (note.kind === 'commitment' && note.resolvedAt) return { label: 'DID WHAT THEY SAID', tone: 'success' };
  return KINDS[note.kind] ?? ABOUT;
}

/** "Yesterday · Ideal user and TikTok pitch · Done", leaving out what is not known. */
export function noteMeta(note: MemoryNoteInput, now: Date = new Date()): string {
  return [formatPubDate(note.createdAt, now), note.sourceTitle?.trim() || null, note.resolvedAt ? 'Done' : null]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The rows: his picture of them first, then everything he noted as one
 * timeline, newest first. The day is written where it changes and the chat
 * where it changes, so five notes from one conversation read as one stretch
 * rather than five copies of where they came from.
 */
export function memoryRows(
  profile: MemoryProfileInput | null,
  notes: readonly MemoryNoteInput[],
  now: Date = new Date(),
): MemoryRow[] {
  const rows: MemoryRow[] = [];
  if (profile) {
    rows.push({ type: 'portrait', key: 'portrait', text: profile.text, updated: `Updated ${formatPubDate(profile.updatedAt, now)}` });
  }
  if (notes.length === 0) return rows;

  rows.push({ type: 'heading', key: 'heading', title: notesHeading(notes.length) });
  let lastDay: string | null = null;
  let lastSource: string | null = null;
  notes.forEach((note, index) => {
    const day = formatPubDate(note.createdAt, now);
    const source = note.sourceTitle?.trim() || null;
    const newDay = day !== lastDay;
    rows.push({
      type: 'event',
      key: note.id,
      note: { id: note.id, text: note.text, meta: noteMeta(note, now), sourceSessionId: note.sourceSessionId },
      ...noteKind(note),
      context: [newDay ? day : null, source && (newDay || source !== lastSource) ? source : null]
        .filter(Boolean)
        .join(' · ') || null,
      last: index === notes.length - 1,
    });
    lastDay = day;
    lastSource = source;
  });
  return rows;
}

/** "12 THINGS HE HAS NOTED". */
export function notesHeading(count: number): string {
  return `${count} ${count === 1 ? 'THING' : 'THINGS'} HE HAS NOTED`;
}

/** What a note's sheet offers. The chat only while it still exists. */
export type MemoryAction = 'correct' | 'chat' | 'forget';

export function memoryMenu(target: { sourceSessionId: string | null }): { key: MemoryAction; label: string; tone?: 'destructive' }[] {
  return [
    { key: 'correct', label: 'Correct this' },
    ...(target.sourceSessionId ? [{ key: 'chat' as const, label: 'Open the chat it came from' }] : []),
    { key: 'forget', label: 'Forget this', tone: 'destructive' as const },
  ];
}

/** What a sheet or the editor is open on: one note, or his picture of them. */
export type MemoryTarget =
  | ({ kind: 'note' } & MemoryNoteView)
  | { kind: 'portrait'; text: string; meta: string; sourceSessionId: null };
