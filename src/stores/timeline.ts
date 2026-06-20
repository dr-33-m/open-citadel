import { desc, eq, like } from "drizzle-orm";
import { create } from "zustand";

import { db } from "@/db/client";
import { books, highlights, notes, thoughts } from "@/db/schema";
import { useSettingsStore } from "@/stores/settings";

export type TimelineItem = {
  type: "highlight" | "thought";
  id: string;
  bookId: string;
  bookTitle: string;
  highlightText: string;
  highlightLocator: string | null;
  chatSessionId: string | null;
  noteTexts: string[];
  tags: string[];
  timestamp: string;
  colorIndicator: string;
  createdAt: string;
  updatedAt: string | null;
};

export type TimelineGroup = {
  date: string;
  label: string;
  entries: TimelineItem[];
};

interface TimelineState {
  groups: TimelineGroup[];
  selectedDate: string;
  isLoading: boolean;

  loadTimeline: (date?: string) => Promise<void>;
  setSelectedDate: (date: string) => void;
  addThought: (text: string, color: string, tags: string[]) => Promise<void>;
  updateThought: (
    id: string,
    text: string,
    color: string,
    tags: string[],
  ) => Promise<void>;
  deleteThought: (id: string) => Promise<void>;
  deleteHighlight: (id: string) => Promise<void>;
}

export function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.getTime() === today.getTime()) return "Today";
  if (date.getTime() === yesterday.getTime()) return "Yesterday";

  const day = date.getDate();
  const suffix =
    day === 1 || day === 21 || day === 31
      ? "st"
      : day === 2 || day === 22
        ? "nd"
        : day === 3 || day === 23
          ? "rd"
          : "th";
  const month = date.toLocaleDateString("en-US", { month: "long" });
  const year = date.getFullYear();
  return `${day}${suffix} of ${month}, ${year}`;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function todayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  groups: [],
  selectedDate: todayDateString(),
  isLoading: false,

  loadTimeline: async (date?: string) => {
    const targetDate = date ?? get().selectedDate;
    set({ isLoading: true, selectedDate: targetDate });

    const datePrefix = `${targetDate}%`;

    // Query highlights for the selected date
    const rows = await db
      .select({
        highlightId: highlights.id,
        highlightText: highlights.text,
        highlightLocator: highlights.locator,
        highlightColor: highlights.color,
        highlightTags: highlights.tags,
        highlightCreatedAt: highlights.createdAt,
        chatSessionId: highlights.chatSessionId,
        bookId: books.id,
        bookTitle: books.title,
        noteId: notes.id,
        noteText: notes.text,
      })
      .from(highlights)
      .innerJoin(books, eq(highlights.bookId, books.id))
      .leftJoin(notes, eq(notes.highlightId, highlights.id))
      .where(like(highlights.createdAt, datePrefix))
      .orderBy(desc(highlights.createdAt));

    // Aggregate notes per highlight
    const highlightOrder: string[] = [];
    const highlightData = new Map<
      string,
      {
        bookId: string;
        bookTitle: string;
        highlightText: string;
        highlightLocator: string | null;
        highlightColor: string;
        highlightTags: string | null;
        highlightCreatedAt: string;
        chatSessionId: string | null;
        noteTexts: string[];
      }
    >();

    for (const row of rows) {
      if (!highlightData.has(row.highlightId)) {
        highlightOrder.push(row.highlightId);
        highlightData.set(row.highlightId, {
          bookId: row.bookId,
          bookTitle: row.bookTitle,
          highlightText: row.highlightText,
          highlightLocator: row.highlightLocator,
          highlightColor: row.highlightColor || "#f2ca50",
          highlightTags: row.highlightTags,
          highlightCreatedAt: row.highlightCreatedAt,
          chatSessionId: row.chatSessionId ?? null,
          noteTexts: [],
        });
      }
      if (row.noteText) {
        highlightData.get(row.highlightId)!.noteTexts.push(row.noteText);
      }
    }

    // Build highlight timeline items
    const highlightItems: TimelineItem[] = highlightOrder.map((id) => {
      const h = highlightData.get(id)!;
      return {
        type: "highlight" as const,
        id,
        bookId: h.bookId,
        bookTitle: h.bookTitle,
        highlightText: h.highlightText,
        highlightLocator: h.highlightLocator,
        chatSessionId: h.chatSessionId,
        noteTexts: h.noteTexts,
        tags: h.highlightTags ? JSON.parse(h.highlightTags) : [],
        timestamp: formatTime(h.highlightCreatedAt),
        colorIndicator: h.highlightColor,
        createdAt: h.highlightCreatedAt,
        updatedAt: null,
      };
    });

    // Query thoughts for the selected date
    const thoughtRows = await db
      .select()
      .from(thoughts)
      .where(like(thoughts.createdAt, datePrefix))
      .orderBy(desc(thoughts.createdAt));

    const username = useSettingsStore.getState().username;
    const thoughtLabel = username ? `Thought — ${username}` : "Thought";

    const thoughtItems: TimelineItem[] = thoughtRows.map((t) => {
      const hasBeenEdited = !!(t.updatedAt && t.updatedAt.length > 0);
      return {
        type: "thought" as const,
        id: t.id,
        bookId: "",
        bookTitle: thoughtLabel,
        highlightText: t.text,
        highlightLocator: null,
        chatSessionId: t.chatSessionId ?? null,
        noteTexts: [],
        tags: t.tags ? JSON.parse(t.tags) : [],
        timestamp: formatTime(hasBeenEdited ? t.updatedAt! : t.createdAt),
        colorIndicator: t.color || "#f2ca50",
        createdAt: t.createdAt,
        updatedAt: hasBeenEdited ? t.updatedAt! : null,
      };
    });

    // Merge and sort by createdAt descending
    const allItems = [...highlightItems, ...thoughtItems].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const groups: TimelineGroup[] =
      allItems.length > 0
        ? [
            {
              date: targetDate,
              label: formatDateLabel(targetDate),
              entries: allItems,
            },
          ]
        : [];

    set({ groups, isLoading: false });
  },

  setSelectedDate: (date: string) => {
    get().loadTimeline(date);
  },

  addThought: async (text: string, color: string, tags: string[]) => {
    const id = `th-${Date.now()}`;
    const now = new Date().toISOString();

    await db.insert(thoughts).values({
      id,
      text,
      color,
      tags: tags.length > 0 ? JSON.stringify(tags) : null,
      createdAt: now,
    });

    await get().loadTimeline();
  },

  updateThought: async (
    id: string,
    text: string,
    color: string,
    tags: string[],
  ) => {
    const now = new Date().toISOString();
    await db
      .update(thoughts)
      .set({
        text,
        color,
        tags: tags.length > 0 ? JSON.stringify(tags) : null,
        updatedAt: now,
      })
      .where(eq(thoughts.id, id));

    await get().loadTimeline();
  },

  deleteThought: async (id: string) => {
    await db.delete(thoughts).where(eq(thoughts.id, id));
    await get().loadTimeline();
  },

  deleteHighlight: async (id: string) => {
    await db.delete(notes).where(eq(notes.highlightId, id));
    await db.delete(highlights).where(eq(highlights.id, id));
    await get().loadTimeline();
  },
}));
