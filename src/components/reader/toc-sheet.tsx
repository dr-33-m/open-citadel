import { ChevronDown, ChevronRight, Search, X } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Link, Locator } from 'react-native-readium';

import { ThemedText } from '@/components/themed-text';
import { colors, fontFamily, spacing } from '@/constants/theme';
import type { highlights as highlightsTable } from '@/db/schema';

type Highlight = typeof highlightsTable.$inferSelect;
type Tab = 'toc' | 'highlights' | 'bookmarks';

const FILTER_COLORS = [
  '#f2ca50',
  '#e05252',
  '#52b788',
  '#4a90d9',
  '#9b72cf',
];

type TocSheetProps = {
  visible: boolean;
  toc: Link[];
  currentHref?: string;
  highlights: Highlight[];
  onChapterPress: (link: Link) => void;
  onHighlightPress: (locator: Locator) => void;
  onClose: () => void;
};

// ── Active chapter matching ───────────────────────────────────────────
function matchesByFile(link: Link, currentHref?: string): boolean {
  if (!currentHref) return false;

  const linkFile = link.href.split('#')[0].split('/').pop() ?? '';
  const locatorFile = currentHref.split('#')[0].split('/').pop() ?? '';

  return (
    linkFile === locatorFile ||
    currentHref.split('#')[0].endsWith(link.href.split('#')[0]) ||
    link.href.split('#')[0].endsWith(currentHref.split('#')[0])
  );
}

// ── Collapsible chapter row ───────────────────────────────────────────
type ChapterRowProps = {
  link: Link;
  depth: number;
  currentHref?: string;
  parentMatched?: boolean;
  onPress: (link: Link) => void;
};

function ChapterRow({ link, depth, currentHref, parentMatched, onPress }: ChapterRowProps) {
  const hasChildren = (link.children?.length ?? 0) > 0;
  const isCurrent = matchesByFile(link, currentHref) && !parentMatched;
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <View
        style={[
          styles.chapterRow,
          depth > 0 && { paddingLeft: spacing[6] + depth * spacing[5] },
        ]}
      >
        {isCurrent && <View style={styles.activeIndicator} />}

        <Pressable style={styles.chapterPressable} onPress={() => onPress(link)}>
          <ThemedText
            type={depth === 0 ? 'bodyMd' : 'bodySm'}
            color={isCurrent ? colors.primary.default : colors.text.primary}
            numberOfLines={2}
            style={styles.chapterTitle}
          >
            {link.title ?? link.href.split('/').pop()}
          </ThemedText>
        </Pressable>

        {hasChildren && (
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            hitSlop={12}
            style={styles.chevronBtn}
          >
            {expanded ? (
              <ChevronDown size={15} color={colors.text.secondary} />
            ) : (
              <ChevronRight size={15} color={colors.text.secondary} />
            )}
          </Pressable>
        )}
      </View>

      {hasChildren && expanded &&
        link.children!.map((child, i) => (
          <ChapterRow
            key={`${child.href}-${i}`}
            link={child}
            depth={depth + 1}
            currentHref={currentHref}
            parentMatched={isCurrent || parentMatched}
            onPress={onPress}
          />
        ))}
    </>
  );
}

// ── Highlights list ───────────────────────────────────────────────────
function HighlightsList({
  highlights,
  onHighlightPress,
}: {
  highlights: Highlight[];
  onHighlightPress: (locator: Locator) => void;
}) {
  const [search, setSearch] = useState('');
  const [activeColor, setActiveColor] = useState<string | null>(null);

  const sorted = [...highlights].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const filtered = sorted.filter((h) => {
    const matchesColor = !activeColor || h.color === activeColor;
    const q = search.trim().toLowerCase();
    if (!q) return matchesColor;
    const inText = h.text.toLowerCase().includes(q);
    const tags: string[] = h.tags ? JSON.parse(h.tags) : [];
    const inTags = tags.some((t) => t.toLowerCase().includes(q));
    return matchesColor && (inText || inTags);
  });

  if (sorted.length === 0) {
    return (
      <ThemedText type="bodySm" color={colors.text.secondary} style={styles.empty}>
        No highlights yet.
      </ThemedText>
    );
  }

  return (
    <>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <Search size={14} color={colors.text.secondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search highlights or tags…"
          placeholderTextColor={colors.text.secondary}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <X size={14} color={colors.text.secondary} />
          </Pressable>
        )}
      </View>

      {/* Color filter */}
      <View style={styles.colorFilterRow}>
        <Pressable
          style={[styles.colorFilterAll, !activeColor && styles.colorFilterAllActive]}
          onPress={() => setActiveColor(null)}
        >
          <ThemedText type="labelSm" color={activeColor ? colors.text.secondary : colors.primary.default}>
            ALL
          </ThemedText>
        </Pressable>
        {FILTER_COLORS.map((c) => (
          <Pressable
            key={c}
            style={[styles.colorFilterDot, { backgroundColor: c }, activeColor === c && styles.colorFilterDotActive]}
            onPress={() => setActiveColor(activeColor === c ? null : c)}
          />
        ))}
      </View>

      {filtered.length === 0 ? (
        <ThemedText type="bodySm" color={colors.text.secondary} style={styles.empty}>
          No highlights match.
        </ThemedText>
      ) : (
        filtered.map((h) => {
          const locator = h.locator
            ? (() => { try { return JSON.parse(h.locator!) as Locator; } catch { return null; } })()
            : null;
          const tags: string[] = h.tags ? JSON.parse(h.tags) : [];
          return (
            <Pressable
              key={h.id}
              style={styles.highlightRow}
              onPress={() => locator && onHighlightPress(locator)}
            >
              <View style={[styles.highlightSwatch, { backgroundColor: h.color ?? colors.primary.default }]} />
              <View style={styles.highlightContent}>
                <ThemedText type="bodySm" color={colors.text.primary} style={styles.highlightText}>
                  {h.text}
                </ThemedText>
                {tags.length > 0 && (
                  <View style={styles.tagRow}>
                    {tags.map((tag) => (
                      <View key={tag} style={styles.tagChip}>
                        <ThemedText type="labelSm" color={colors.text.secondary} style={styles.tagChipText}>
                          {tag}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </Pressable>
          );
        })
      )}
    </>
  );
}

// ── Sheet ─────────────────────────────────────────────────────────────
export function TocSheet({
  visible,
  toc,
  currentHref,
  highlights,
  onChapterPress,
  onHighlightPress,
  onClose,
}: TocSheetProps) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('toc');

  const TABS: { id: Tab; label: string }[] = [
    { id: 'toc', label: 'Contents' },
    { id: 'highlights', label: 'Highlights' },
    { id: 'bookmarks', label: 'Bookmarks' },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing[4] }]}>
          {/* Header */}
          <View style={[styles.sheetHeader, { paddingTop: insets.top + spacing[4] }]}>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.text.secondary} />
            </Pressable>
          </View>

          {/* Tabs */}
          <View style={styles.tabBar}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  style={styles.tab}
                  onPress={() => setActiveTab(tab.id)}
                >
                  <ThemedText
                    type="labelSm"
                    color={isActive ? colors.primary.default : colors.text.secondary}
                  >
                    {tab.label}
                  </ThemedText>
                  {isActive && <View style={styles.tabUnderline} />}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.divider} />

          {/* Content */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            key={activeTab}
            keyboardShouldPersistTaps="handled"
          >
            {activeTab === 'toc' && (
              toc.length === 0 ? (
                <ThemedText type="bodySm" color={colors.text.secondary} style={styles.empty}>
                  No table of contents available.
                </ThemedText>
              ) : (
                toc.map((link, i) => (
                  <ChapterRow
                    key={`${link.href}-${i}`}
                    link={link}
                    depth={0}
                    currentHref={currentHref}
                    onPress={onChapterPress}
                  />
                ))
              )
            )}

            {activeTab === 'highlights' && (
              <HighlightsList highlights={highlights} onHighlightPress={onHighlightPress} />
            )}

            {activeTab === 'bookmarks' && (
              <View style={styles.comingSoon}>
                <ThemedText type="bodySm" color={colors.text.secondary}>
                  Bookmarks coming soon.
                </ThemedText>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    flex: 1,
    maxHeight: '85%',
    backgroundColor: colors.surface.low,
    borderTopWidth: 1,
    borderTopColor: colors.surface.highest,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing[6],
    paddingBottom: spacing[2],
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing[6],
    gap: spacing[6],
  },
  tab: {
    paddingBottom: spacing[3],
    alignItems: 'center',
    gap: spacing[1],
  },
  tabUnderline: {
    height: 2,
    width: '100%',
    backgroundColor: colors.primary.default,
    borderRadius: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.surface.highest,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: spacing[4],
  },
  // TOC
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[4],
    gap: spacing[3],
  },
  chapterPressable: {
    flex: 1,
  },
  activeIndicator: {
    width: 3,
    height: 16,
    backgroundColor: colors.primary.default,
    borderRadius: 2,
  },
  chapterTitle: {
    // flex handled by chapterPressable
  },
  chevronBtn: {
    paddingLeft: spacing[2],
  },
  // Highlights filter
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing[6],
    marginBottom: spacing[2],
    backgroundColor: colors.surface.mid,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    gap: spacing[2],
  },
  searchIcon: {
    // just for layout
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fontFamily.sans,
    fontSize: 14,
  },
  colorFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginHorizontal: spacing[6],
    marginBottom: spacing[3],
  },
  colorFilterAll: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  colorFilterAllActive: {
    borderBottomWidth: 1,
    borderBottomColor: colors.primary.default,
  },
  colorFilterDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  colorFilterDotActive: {
    borderWidth: 2,
    borderColor: colors.text.primary,
  },
  // Highlight rows
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.surface.highest,
  },
  highlightSwatch: {
    width: 3,
    minHeight: 16,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginTop: 2,
  },
  highlightContent: {
    flex: 1,
    gap: spacing[2],
  },
  highlightText: {
    fontFamily: fontFamily.serifItalic,
    lineHeight: 22,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  tagChip: {
    backgroundColor: colors.surface.mid,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: 99,
  },
  tagChipText: {
    fontSize: 11,
  },
  empty: {
    padding: spacing[6],
    textAlign: 'center',
  },
  comingSoon: {
    padding: spacing[6],
    alignItems: 'center',
  },
});
