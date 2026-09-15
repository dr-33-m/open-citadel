import { ChevronDown, ChevronRight } from "@/components/icons";
import React, { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { useCSSVariable } from "uniwind";

import { PageFade } from "@/components/scroll-fades";
import { Item } from "@/components/ui/item";
import { Sheet } from "@/components/ui/sheet";
import { TocBookmarksSkeleton } from "@/components/skeletons/toc-bookmarks-skeleton";
import { TocChaptersSkeleton } from "@/components/skeletons/toc-chapters-skeleton";
import { TocHighlightsSkeleton } from "@/components/skeletons/toc-highlights-skeleton";
import { Touchable } from "@/components/ui/touchable";
import type { Link, Locator } from "@dr33m/react-native-readium";

import { BookmarksTab } from "@/components/reader/toc-bookmarks-tab";
import { HighlightsTab } from "@/components/reader/toc-highlights-tab";
import {
  FILL,
  type Bookmark,
  type Highlight,
  type RowColors,
} from "@/components/reader/toc-shared";
import { ThemedText } from "@/components/themed-text";
import { spacing } from "@/constants/theme";
import { asColor } from "@/utils/colors";

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
          wrong one is just a differently-shaped pop. One `Deferred` for all
          three rather than one per tab, so it hands over once per open and a
          tab switch after that never flashes a placeholder. The highlights
          and bookmarks search fields are therefore inside it, and their
          skeletons draw them. */}
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
        <HighlightsTab
          highlights={highlights}
          onHighlightPress={onHighlightPress}
          colors={colors}
        />
      )}

      {activeTab === "bookmarks" && (
        <BookmarksTab
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
