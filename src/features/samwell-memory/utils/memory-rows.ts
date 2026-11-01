/**
 * What the screen of Samwell's notes draws, and in what order. Pure: the words
 * and the grouping are decided here, and the components render them.
 */
export type MemoryNoteInput = {
  id: string;
  kind: string;
  text: string;
  resolvedAt: string | null;
  createdAt: string;
};

export type MemoryRow =
  | { type: 'label'; key: string; title: string }
  | { type: 'profile'; key: string; text: string }
  | { type: 'note'; key: string; id: string; text: string; createdAt: string; closed: boolean };

const SECTIONS: { title: string; kinds: readonly string[] }[] = [
  { title: 'WINS AND MILESTONES', kinds: ['win', 'milestone', 'goal_finished'] },
  { title: 'WHAT YOU SAID YOU WOULD DO', kinds: ['commitment'] },
  { title: 'WHAT YOU ARE WORKING THROUGH', kinds: ['struggle'] },
  { title: 'ABOUT YOU', kinds: ['about', 'reflection'] },
  { title: 'WHAT HE POINTED YOU TO', kinds: ['recommended'] },
  { title: 'BOOKS', kinds: ['book_finished', 'book_removed'] },
];

/** The rows, sections with nothing in them left out. */
export function memoryRows(profile: string | null, notes: readonly MemoryNoteInput[]): MemoryRow[] {
  const rows: MemoryRow[] = [];
  if (profile) {
    rows.push({ type: 'label', key: 'label-profile', title: 'HOW HE SEES YOU' });
    rows.push({ type: 'profile', key: 'profile', text: profile });
  }
  for (const section of SECTIONS) {
    const inSection = notes.filter((note) => section.kinds.includes(note.kind));
    if (inSection.length === 0) continue;
    rows.push({ type: 'label', key: `label-${section.title}`, title: section.title });
    for (const note of inSection) {
      rows.push({
        type: 'note',
        key: note.id,
        id: note.id,
        text: note.text,
        createdAt: note.createdAt,
        closed: note.resolvedAt !== null,
      });
    }
  }
  return rows;
}

/** The line under the title: how much there is, or that there is nothing yet. */
export function memorySubtitle(profile: string | null, noteCount: number): string {
  if (noteCount === 0) return profile ? 'HOW HE SEES YOU' : 'NOTHING YET';
  return `${noteCount} ${noteCount === 1 ? 'NOTE' : 'NOTES'}`;
}
