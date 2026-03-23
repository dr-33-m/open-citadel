import { create } from 'zustand';
import { desc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { books, highlights, notes } from '@/db/schema';

export type TimelineItem = {
  id: string;
  bookId: string;
  bookTitle: string;
  highlightText: string;
  highlightLocator: string | null;
  noteTexts: string[];
  tags: string[];
  timestamp: string;
  colorIndicator: string;
  createdAt: string;
};

export type TimelineGroup = {
  date: string;
  label: string;
  entries: TimelineItem[];
};

interface TimelineState {
  groups: TimelineGroup[];
  isLoading: boolean;

  loadTimeline: () => Promise<void>;
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === yesterday.getTime()) return 'Yesterday';

  const day = date.getDate();
  const suffix =
    day === 1 || day === 21 || day === 31
      ? 'st'
      : day === 2 || day === 22
        ? 'nd'
        : day === 3 || day === 23
          ? 'rd'
          : 'th';
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  const year = date.getFullYear();
  return `${day}${suffix} of ${month}, ${year}`;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export const useTimelineStore = create<TimelineState>((set) => ({
  groups: [],
  isLoading: false,

  loadTimeline: async () => {
    set({ isLoading: true });

    // Query highlights with their books and optional notes
    const rows = await db
      .select({
        highlightId: highlights.id,
        highlightText: highlights.text,
        highlightLocator: highlights.locator,
        highlightColor: highlights.color,
        highlightTags: highlights.tags,
        highlightCreatedAt: highlights.createdAt,
        bookId: books.id,
        bookTitle: books.title,
        noteId: notes.id,
        noteText: notes.text,
      })
      .from(highlights)
      .innerJoin(books, eq(highlights.bookId, books.id))
      .leftJoin(notes, eq(notes.highlightId, highlights.id))
      .orderBy(desc(highlights.createdAt));

    // Aggregate: collect all notes per highlight (LEFT JOIN gives one row per note)
    const highlightOrder: string[] = [];
    const highlightData = new Map<string, {
      bookId: string;
      bookTitle: string;
      highlightText: string;
      highlightLocator: string | null;
      highlightColor: string;
      highlightTags: string | null;
      highlightCreatedAt: string;
      noteTexts: string[];
    }>();

    for (const row of rows) {
      if (!highlightData.has(row.highlightId)) {
        highlightOrder.push(row.highlightId);
        highlightData.set(row.highlightId, {
          bookId: row.bookId,
          bookTitle: row.bookTitle,
          highlightText: row.highlightText,
          highlightLocator: row.highlightLocator,
          highlightColor: row.highlightColor || '#f2ca50',
          highlightTags: row.highlightTags,
          highlightCreatedAt: row.highlightCreatedAt,
          noteTexts: [],
        });
      }
      if (row.noteText) {
        highlightData.get(row.highlightId)!.noteTexts.push(row.noteText);
      }
    }

    const groupMap = new Map<string, TimelineItem[]>();
    for (const id of highlightOrder) {
      const h = highlightData.get(id)!;
      const date = h.highlightCreatedAt.split('T')[0];
      if (!groupMap.has(date)) groupMap.set(date, []);
      groupMap.get(date)!.push({
        id,
        bookId: h.bookId,
        bookTitle: h.bookTitle,
        highlightText: h.highlightText,
        highlightLocator: h.highlightLocator,
        noteTexts: h.noteTexts,
        tags: h.highlightTags ? JSON.parse(h.highlightTags) : [],
        timestamp: formatTime(h.highlightCreatedAt),
        colorIndicator: h.highlightColor,
        createdAt: h.highlightCreatedAt,
      });
    }

    const groups: TimelineGroup[] = Array.from(groupMap.entries()).map(
      ([date, entries]) => ({
        date,
        label: formatDateLabel(date),
        entries,
      })
    );

    set({ groups, isLoading: false });
  },
}));
