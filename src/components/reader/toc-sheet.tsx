import {
  Bookmark as BookmarkIcon,
  ChevronDown,
  ChevronRight,
} from "@/components/icons";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useCSSVariable } from "uniwind";

import { PageFade } from "@/components/scroll-fades";
import { Input } from "@/components/ui/input";
import { SearchBar } from "@/components/ui/search-bar";
import { Item } from "@/components/ui/item";
import { Sheet } from "@/components/ui/sheet";
import { TocBookmarksSkeleton } from "@/components/skeletons/toc-bookmarks-skeleton";
import { TocChaptersSkeleton } from "@/components/skeletons/toc-chapters-skeleton";
import { TocHighlightsSkeleton } from "@/components/skeletons/toc-highlights-skeleton";
import { Touchable } from "@/components/ui/touchable";
import type { Link, Locator } from "@dr33m/react-native-readium";

import { ThemedText } from "@/components/themed-text";
import { ColorSwatch, HIGHLIGHT_COLORS } from "@/components/color-swatch";
import { spacing } from "@/constants/theme";
import type {
  bookmarks as bookmarksTable,
  highlights as highlightsTable,
} from "@/db/schema";
import { cn } from "@/lib/cn";
import { asColor } from "@/utils/colors";

type Bookmark = typeof bookmarksTable.$inferSelect;
type Highlight = typeof highlightsTable.$inferSelect;
type Tab = "toc" | "highlights" | "bookmarks";

export type TocSheetProps = {
  visible: boolean;
  toc: Link[];
  currentHref?: string;
  highlights: Highlight[];
  bookmarkItems: Bookmark[];
  onChapterPress: (link: Link) => void;
  onHighlightPress: (locator: Locator) => void;
  onBookmarkPress: (locator: Locator) => void;
  onUpdateBookmarkNote: (id: string, note: string) => Promise<void>;
  onClose: () => void;
};

/** Hoisted: a fresh style object per render re-lays the scroll region out. */
const FILL = { flex: 1 } as const;

/** Theme colours a row needs, hoisted so rows never subscribe per cell. */
type RowColors = {
  primary?: string;
  mutedForeground?: string;
};

// ── Active chapter matching ───────────────────────────────────────────
function matchesByFile(link: Link, currentHref?: string): boolean {
  if (!currentHref) return false;
  const linkFile = link.href.split("#")[0].split("/").pop() ?? "";
  const locatorFile = currentHref.split("#")[0].split("/").pop() ?? "";
  return (
    linkFile === locatorFile ||
    currentHref.split("#")[0].endsWith(link.href.split("#")[0]) ||
    link.href.split("#")[0].endsWith(currentHref.split("#")[0])
  );
}

// ── Contents tab ──────────────────────────────────────────────────────
type ChapterRowData = {
  id: string;
  link: Link;
  depth: number;
  /** This chapter is the one being read, and no ancestor of it already
   * claimed the match — the flag the recursive renderer computed per row. */
  isCurrent: boolean;
};

/**
 * One visible chapter row. Memoized: the TOC can run to hundreds of rows,
 * and without memo every colour/locator change or expand re-rendered the
 * whole tree rather than the dozen rows on screen.
 */
const ChapterRow = React.memo(function ChapterRow({
  data,
  hasChildren,
  expanded,
  colors,
  onPress,
  onToggle,
}: {
  data: ChapterRowData;
  hasChildren: boolean;
  expanded: boolean;
  colors: RowColors;
  onPress: (link: Link) => void;
  onToggle: (id: string) => void;
}) {
  const { link, depth, isCurrent } = data;
  return (
    /* Row press navigates; the disclosure chevron keeps its own Touchable
        so expanding never also fires the chapter press. */
    <Item
      className="py-4 pr-6"
      style={{ paddingLeft: spacing[6] + depth * spacing[5] }}
      onPress={() => onPress(link)}
    >
      {isCurrent && (
        <Item.Media className="h-4 w-[3px] rounded-[2px] bg-primary" />
      )}
      <Item.Content>
        <ThemedText
          type={depth === 0 ? "bodyMd" : "bodySm"}
          color={isCurrent ? colors.primary : undefined}
          numberOfLines={2}
        >
          {link.title ?? link.href.split("/").pop()}
        </ThemedText>
      </Item.Content>
      {hasChildren && (
        <Item.Actions>
          <Touchable
            className="pl-2"
            onPress={() => onToggle(data.id)}
            hitSlop={12}
          >
            {expanded ? (
              <ChevronDown size={15} color={colors.mutedForeground} />
            ) : (
              <ChevronRight size={15} color={colors.mutedForeground} />
            )}
          </Touchable>
        </Item.Actions>
      )}
    </Item>
  );
});

function TocList({
  toc,
  currentHref,
  colors,
  onChapterPress,
}: {
  toc: Link[];
  currentHref?: string;
  colors: RowColors;
  onChapterPress: (link: Link) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /*
   * The tree flattened to the rows that are actually visible, with the
   * current-chapter match resolved during the walk (an ancestor that
   * matched claims the highlight for its subtree, exactly as the old
   * recursive renderer's `parentMatched` did). Recomputed only when the
   * tree or an expansion changes — never per render — and virtualized
   * below, so a 400-chapter TOC mounts the same dozen rows as a
   * 4-chapter one.
   */
  const rows = useMemo<ChapterRowData[]>(() => {
    const out: ChapterRowData[] = [];
    const walk = (links: Link[], depth: number, prefix: string, parentMatched: boolean) => {
      links.forEach((link, i) => {
        const id = `${prefix}${link.href}-${i}`;
        const isCurrent = matchesByFile(link, currentHref) && !parentMatched;
        out.push({ id, link, depth, isCurrent });
        const children = link.children ?? [];
        if (children.length > 0 && expandedIds.has(id)) {
          walk(children, depth + 1, `${id}/`, isCurrent || parentMatched);
        }
      });
    };
    walk(toc, 0, "", false);
    return out;
  }, [toc, expandedIds, currentHref]);

  const renderItem = useCallback(
    ({ item }: { item: ChapterRowData }) => (
      <ChapterRow
        data={item}
        hasChildren={(item.link.children?.length ?? 0) > 0}
        expanded={expandedIds.has(item.id)}
        colors={colors}
        onPress={onChapterPress}
        onToggle={toggle}
      />
    ),
    [colors, onChapterPress, toggle, expandedIds],
  );

  if (rows.length === 0) {
    return (
      <ThemedText type="bodySm" color={colors.mutedForeground} className="px-6">
        No table of contents available.
      </ThemedText>
    );
  }

  return (
    <PageFade edges="both" surface="popover">
      <Sheet.FlatList
        style={FILL}
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </PageFade>
  );
}

// ── Highlights tab ────────────────────────────────────────────────────
type HighlightRowData = {
  id: string;
  text: string;
  color: string | null;
  tags: string[];
  locator: Locator | null;
};

/**
 * The search-and-filters header. Memoized so a keystroke only re-renders
 * the visible rows — the field itself is uncontrolled (no `value`
 * round-trip: a keystroke that lands while JS is busy can no longer be
 * committed over by a stale string) and its text escapes via `onSearch`.
 */
const HighlightsHeader = React.memo(function HighlightsHeader({
  activeColor,
  onSelectColor,
  onSearch,
}: {
  activeColor: string | null;
  onSelectColor: (color: string | null) => void;
  onSearch: (text: string) => void;
}) {
  const [primary, mutedForeground] = useCSSVariable([
    "--color-primary",
    "--color-muted-foreground",
  ]);
  return (
    /* Search and its filters are one control, so they sit 16 apart inside
        a block that keeps 24 below it — not 8 apart with 12 below, which
        left the filter row reading as a stray strip between the field and
        the results. The swatches are the same shared control as the reader's
        own colour picker, at the same size and with the same ring. */
    <View className="mx-6 mb-6 mt-4 gap-4">
      <SearchBar
        variant="filled"
        placeholder="Search highlights or tags…"
        onChangeText={onSearch}
        returnKeyType="search"
      />

      <View className="flex-row items-center gap-3">
        <Touchable
          className={cn(
            "h-7 justify-center pr-1",
            !activeColor && "border-b border-primary",
          )}
          onPress={() => onSelectColor(null)}
        >
          <ThemedText
            type="labelSm"
            color={activeColor ? asColor(mutedForeground) : asColor(primary)}
          >
            ALL
          </ThemedText>
        </Touchable>
        {HIGHLIGHT_COLORS.map((c) => (
          <ColorSwatch
            key={c}
            color={c}
            selected={activeColor === c}
            onPress={() => onSelectColor(c)}
            accessibilityLabel={`Filter by colour ${c}`}
          />
        ))}
      </View>
    </View>
  );
});

const HighlightRow = React.memo(function HighlightRow({
  data,
  colors,
  onPress,
}: {
  data: HighlightRowData;
  colors: RowColors;
  onPress: (locator: Locator) => void;
}) {
  return (
    <Item
      className="items-stretch border-b border-surface-tertiary px-6 py-4"
      onPress={() => data.locator && onPress(data.locator)}
    >
      <Item.Media
        className="w-1 min-h-[20px] self-stretch rounded-[2px]"
        style={{ backgroundColor: data.color ?? colors.primary }}
      />
      <Item.Content className="gap-2">
        <ThemedText type="bodySm">{data.text}</ThemedText>
        {data.tags.length > 0 && (
          <View className="flex-row flex-wrap gap-2">
            {data.tags.map((tag) => (
              <View
                key={tag}
                className="rounded-full border border-surface-tertiary bg-muted px-3 py-[2px]"
              >
                <ThemedText type="labelSm" color={colors.mutedForeground}>
                  {tag}
                </ThemedText>
              </View>
            ))}
          </View>
        )}
      </Item.Content>
    </Item>
  );
});

function HighlightsList({
  highlights,
  onHighlightPress,
  colors,
}: {
  highlights: Highlight[];
  onHighlightPress: (locator: Locator) => void;
  colors: RowColors;
}) {
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  /*
   * Parse and sort once per data change, not once per row per render: tags
   * and locators arrive as JSON strings and used to be `JSON.parse`d inside
   * every row on every render of the list. Parsing is split from filtering
   * so a keystroke filters the parsed rows instead of re-parsing them.
   */
  const parsed = useMemo<HighlightRowData[]>(() => {
    const rows = highlights.map((h) => ({
      id: h.id,
      text: h.text,
      color: h.color,
      tags: h.tags
        ? (() => {
            try {
              return JSON.parse(h.tags) as string[];
            } catch {
              return [];
            }
          })()
        : [],
      locator: h.locator
        ? (() => {
            try {
              return JSON.parse(h.locator) as Locator;
            } catch {
              return null;
            }
          })()
        : null,
      createdAt: h.createdAt,
    }));
    rows.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return rows;
  }, [highlights]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query && !activeColor) return parsed;
    return parsed.filter((h) => {
      const matchesColor = !activeColor || h.color === activeColor;
      if (!query) return matchesColor;
      const inText = h.text.toLowerCase().includes(query);
      const inTags = h.tags.some((t) => t.toLowerCase().includes(query));
      return matchesColor && (inText || inTags);
    });
  }, [parsed, search, activeColor]);

  const renderItem = useCallback(
    ({ item }: { item: HighlightRowData }) => (
      <HighlightRow data={item} colors={colors} onPress={onHighlightPress} />
    ),
    [colors, onHighlightPress],
  );

  if (rows.length === 0 && highlights.length === 0) {
    return (
      <ThemedText type="bodySm" color={colors.mutedForeground} className="px-6 py-6">
        No highlights yet.
      </ThemedText>
    );
  }

  return (
    <PageFade edges="both" surface="popover">
      <Sheet.FlatList
        style={FILL}
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <HighlightsHeader
            activeColor={activeColor}
            onSelectColor={setActiveColor}
            onSearch={setSearch}
          />
        }
      />
    </PageFade>
  );
}

// ── Bookmarks tab ─────────────────────────────────────────────────────
type BookmarkRowData = {
  id: string;
  chapter: string | null;
  page: number | null;
  note: string | null;
  createdAt: string;
  locator: Locator | null;
};

const BookmarkRow = React.memo(function BookmarkRow({
  data,
  colors,
  onBookmarkPress,
  onEditNote,
  isEditing,
  onCancelEdit,
  onSaveNote,
}: {
  data: BookmarkRowData;
  colors: RowColors;
  onBookmarkPress: (locator: Locator) => void;
  onEditNote: (id: string) => void;
  isEditing: boolean;
  onCancelEdit: () => void;
  onSaveNote: (id: string, note: string) => void;
}) {
  /* The draft text lives here, in the row, mirrored from the uncontrolled
      input below — the list never re-renders on a keystroke. */
  const noteRef = useRef(data.note ?? "");
  const dateLabel = new Date(data.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    /* Not pressable as a whole: icon, title and note are independent
        targets, so Item stays a plain row and the Touchables keep their
        own handlers. */
    <Item className="items-start border-b border-surface-tertiary px-6 py-4">
      <Item.Media>
        <Touchable onPress={() => data.locator && onBookmarkPress(data.locator)}>
          <BookmarkIcon size={16} color={colors.primary} />
        </Touchable>
      </Item.Media>
      <Item.Content className="gap-1">
        <Touchable onPress={() => data.locator && onBookmarkPress(data.locator)}>
          <ThemedText type="bodySm">
            {data.chapter || `Page ${data.page ?? "?"}`}
          </ThemedText>
          <ThemedText type="labelSm" color={colors.mutedForeground}>
            {dateLabel}
          </ThemedText>
        </Touchable>

        {/* Note display / edit */}
        {isEditing ? (
          <>
            {/* Fixed height, not `minHeight` — a growing box changes the
                sheet's own measured content height on every line wrap, which
                is what caused the original jitter elsewhere in this app.
                See new-thought-sheet.tsx. */}
            <Input
              // Uncontrolled and keyed by the bookmark: each edit session
              // remounts the field with that note's text (the buffer is
              // native-owned, so it cannot be set from state) and typing
              // can never be committed over by a stale `value` — see
              // new-thought-sheet.tsx for the full story.
              key={data.id}
              defaultValue={data.note ?? ""}
              onChangeText={(text) => {
                noteRef.current = text;
              }}
              placeholder="Add a note…"
              style={{ height: 60, textAlignVertical: "top", marginTop: spacing[1] }}
              multiline
              autoFocus
            />
            <View className="mt-2 flex-row gap-4">
              <Touchable onPress={onCancelEdit} hitSlop={8}>
                <ThemedText type="labelSm" color={colors.mutedForeground}>
                  CANCEL
                </ThemedText>
              </Touchable>
              <Touchable
                onPress={() => onSaveNote(data.id, noteRef.current.trim())}
                hitSlop={8}
              >
                <ThemedText type="labelSm" color={colors.primary}>
                  SAVE
                </ThemedText>
              </Touchable>
            </View>
          </>
        ) : (
          <Touchable onPress={() => onEditNote(data.id)} hitSlop={4}>
            {data.note ? (
              <ThemedText
                color={colors.mutedForeground}
                italic
                style={{ fontSize: 13, lineHeight: 18 }}
              >
                {data.note}
              </ThemedText>
            ) : (
              <ThemedText type="labelSm" color={colors.mutedForeground}>
                + add note
              </ThemedText>
            )}
          </Touchable>
        )}
      </Item.Content>
    </Item>
  );
});

function BookmarksList({
  bookmarkItems,
  onBookmarkPress,
  onUpdateBookmarkNote,
  colors,
}: {
  bookmarkItems: Bookmark[];
  onBookmarkPress: (locator: Locator) => void;
  onUpdateBookmarkNote: (id: string, note: string) => Promise<void>;
  colors: RowColors;
}) {
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  // Stable handlers: every prop BookmarkRow receives keeps its identity
  // across renders, so a keystroke (which never reaches the list) and an
  // edit-session change re-render only the affected row, never the sheet.
  const handleCancelEdit = useCallback(() => setEditingNoteId(null), []);
  const handleSaveNote = useCallback(
    (id: string, note: string) => {
      void onUpdateBookmarkNote(id, note);
      setEditingNoteId(null);
    },
    [onUpdateBookmarkNote],
  );

  const rows = useMemo<BookmarkRowData[]>(() => {
    const parsed = bookmarkItems.map((bm) => ({
      id: bm.id,
      chapter: bm.chapter,
      page: bm.page,
      note: bm.note,
      createdAt: bm.createdAt,
      locator: (() => {
        try {
          return JSON.parse(bm.locator) as Locator;
        } catch {
          return null;
        }
      })(),
    }));
    parsed.sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
    return parsed;
  }, [bookmarkItems]);

  const renderItem = useCallback(
    ({ item }: { item: BookmarkRowData }) => (
      <BookmarkRow
        data={item}
        colors={colors}
        onBookmarkPress={onBookmarkPress}
        onEditNote={setEditingNoteId}
        isEditing={editingNoteId === item.id}
        onCancelEdit={handleCancelEdit}
        onSaveNote={handleSaveNote}
      />
    ),
    [colors, onBookmarkPress, editingNoteId, handleCancelEdit, handleSaveNote],
  );

  if (rows.length === 0) {
    return (
      <ThemedText
        type="bodySm"
        color={colors.mutedForeground}
        className="px-6 py-6"
      >
        No bookmarks yet. Tap the bookmark icon to save your place.
      </ThemedText>
    );
  }

  return (
    <PageFade edges="both" surface="popover">
      <Sheet.FlatList
        style={FILL}
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </PageFade>
  );
}

// ── Sheet ─────────────────────────────────────────────────────────────
export function TocSheet({
  visible,
  toc,
  currentHref,
  highlights,
  bookmarkItems,
  onChapterPress,
  onHighlightPress,
  onBookmarkPress,
  onUpdateBookmarkNote,
  onClose,
}: TocSheetProps) {
  const [primary, mutedForeground] = useCSSVariable([
    "--color-primary",
    "--color-muted-foreground",
  ]);
  const [activeTab, setActiveTab] = useState<Tab>("toc");

  const TABS: { id: Tab; label: string }[] = [
    { id: "toc", label: "Contents" },
    { id: "highlights", label: "Highlights" },
    { id: "bookmarks", label: "Bookmarks" },
  ];

  const colors = useMemo<RowColors>(
    () => ({
      primary: asColor(primary),
      mutedForeground: asColor(mutedForeground),
    }),
    [primary, mutedForeground],
  );

  return (
    // No `scrollable` here: that flag is for a sheet whose whole content is
    // the scroll region, and this one has a tab bar pinned above it.
    // `fixedHeightRatio` already gives the sheet a definite height for the
    // `flex: 1` scroll region to size against — the tab bar and divider take
    // their natural height first, same as any other RN flex column.
    <Sheet visible={visible} onClose={onClose} fixedHeightRatio={0.85}>
      <View className="flex-row gap-6 px-6">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Touchable
              key={tab.id}
              className="items-center gap-1 pb-3"
              onPress={() => setActiveTab(tab.id)}
            >
              <ThemedText
                type="labelSm"
                color={isActive ? asColor(primary) : asColor(mutedForeground)}
              >
                {tab.label}
              </ThemedText>
              {isActive && (
                <View className="h-[2px] w-full rounded-[1px] bg-primary" />
              )}
            </Touchable>
          );
        })}
      </View>

      <View className="h-px bg-surface-tertiary" />

      {/* The tab strip above renders with the sheet; only the lists wait a
          frame. A real book's chapter list runs to hundreds of rows, and all
          three tabs' data is read on mount. */}
      {/* The placeholder follows the tab: chapters, highlights and bookmarks
          are three different row shapes, and a stand-in borrowed from the
          wrong one is just a differently-shaped pop. */}
      <Sheet.Deferred
        skeleton={
          activeTab === "toc" ? (
            <TocChaptersSkeleton />
          ) : activeTab === "highlights" ? (
            <TocHighlightsSkeleton />
          ) : (
            <TocBookmarksSkeleton />
          )
        }
      >
      {activeTab === "toc" && (
        <TocList
          toc={toc}
          currentHref={currentHref}
          colors={colors}
          onChapterPress={onChapterPress}
        />
      )}

      {activeTab === "highlights" && (
        <HighlightsList
          highlights={highlights}
          onHighlightPress={onHighlightPress}
          colors={colors}
        />
      )}

      {activeTab === "bookmarks" && (
        <BookmarksList
          bookmarkItems={bookmarkItems}
          onBookmarkPress={onBookmarkPress}
          onUpdateBookmarkNote={onUpdateBookmarkNote}
          colors={colors}
        />
      )}
      </Sheet.Deferred>
    </Sheet>
  );
}
