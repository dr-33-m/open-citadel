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

export type MemoryRow =
  | { type: 'portrait'; key: string; text: string; updated: string }
  | { type: 'section'; key: string; title: string; notes: MemoryNoteView[] };

const SECTIONS: { title: string; kinds: readonly string[] }[] = [
  { title: 'WINS AND MILESTONES', kinds: ['win', 'milestone', 'goal_finished'] },
  { title: 'WHAT YOU SAID YOU WOULD DO', kinds: ['commitment'] },
  { title: 'WHAT YOU ARE WORKING THROUGH', kinds: ['struggle'] },
  { title: 'ABOUT YOU', kinds: ['about', 'reflection'] },
  { title: 'WHAT HE POINTED YOU TO', kinds: ['recommended'] },
  { title: 'BOOKS', kinds: ['book_finished', 'book_removed'] },
];

/** "Yesterday · Ideal user and TikTok pitch · Done", leaving out what is not known. */
export function noteMeta(note: MemoryNoteInput, now: Date = new Date()): string {
  return [formatPubDate(note.createdAt, now), note.sourceTitle?.trim() || null, note.resolvedAt ? 'Done' : null]
    .filter(Boolean)
    .join(' · ');
}

/** The rows: his picture of them first, then a card per kind of note, empty kinds left out. */
export function memoryRows(
  profile: MemoryProfileInput | null,
  notes: readonly MemoryNoteInput[],
  now: Date = new Date(),
): MemoryRow[] {
  const rows: MemoryRow[] = [];
  if (profile) {
    rows.push({ type: 'portrait', key: 'portrait', text: profile.text, updated: `Updated ${formatPubDate(profile.updatedAt, now)}` });
  }
  for (const section of SECTIONS) {
    const inSection = notes.filter((note) => section.kinds.includes(note.kind));
    if (inSection.length === 0) continue;
    rows.push({
      type: 'section',
      key: section.title,
      title: section.title,
      notes: inSection.map((note) => ({
        id: note.id,
        text: note.text,
        meta: noteMeta(note, now),
        sourceSessionId: note.sourceSessionId,
      })),
    });
  }
  return rows;
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
