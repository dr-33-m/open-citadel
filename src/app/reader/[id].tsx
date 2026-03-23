import { useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import type {
  DecorationActivatedEvent,
  DecorationGroup,
  Locator,
  PublicationReadyEvent,
  ReadiumViewRef,
  SelectionAction,
  SelectionActionEvent,
} from "react-native-readium";
import { ReadiumView } from "react-native-readium";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HighlightMenu } from "@/components/reader/highlight-menu";
import { ReaderHeader } from "@/components/reader/reader-header";
import { TocSheet } from "@/components/reader/toc-sheet";
import { ThemedText } from "@/components/themed-text";
import { spacing } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { useBooksStore } from "@/stores/books";
import { useReaderStore } from "@/stores/reader";
import { useSettingsStore } from "@/stores/settings";

const selectionActions: SelectionAction[] = [
  { id: "highlight", label: "Highlight" },
];

const HEADER_HIDE_DELAY = 4000;
// Height of the header content below the status bar
const HEADER_CONTENT_HEIGHT = 52;

export default function ReaderScreen() {
  const colors = useColors();
  const appTheme = useSettingsStore((s) => s.theme);
  const styles = useReaderStyles(colors);
  const { id, locator: locatorParam } = useLocalSearchParams<{
    id: string;
    locator?: string;
  }>();
  const router = useRouter();
  const readerRef = useRef<ReadiumViewRef>(null);
  const insets = useSafeAreaInsets();

  const {
    currentBook,
    savedLocator,
    currentLocator,
    bookmarkList,
    highlights,
    highlightNotes,
    allTags,
    tableOfContents,
    isLoading,
    openBook,
    updateProgress,
    addBookmark,
    removeBookmark,
    updateBookmarkNote,
    addHighlight,
    updateHighlight,
    deleteHighlight,
    addNote,
    updateNote,
    deleteNote,
    setTableOfContents,
    closeBook,
  } = useReaderStore();

  const { updateBookMetadata } = useBooksStore();

  const [menuHighlight, setMenuHighlight] = useState<{
    id: string;
    text: string;
    color: string;
    tags: string[];
  } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [preJumpLocator, setPreJumpLocator] = useState<Locator | null>(null);
  const [publicationReady, setPublicationReady] = useState(false);
  // Bookmark note prompt — shown after adding a bookmark
  const [bookmarkNotePrompt, setBookmarkNotePrompt] = useState<{
    id: string;
    note: string;
  } | null>(null);

  // ── Animated header ────────────────────────────────────────────────
  const headerAnim = useRef(new Animated.Value(1)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerShownRef = useRef(true);

  const hideHeader = useCallback(() => {
    headerShownRef.current = false;
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    Animated.timing(headerAnim, {
      toValue: 0,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [headerAnim]);

  const showHeader = useCallback(() => {
    headerShownRef.current = true;
    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(hideHeader, HEADER_HIDE_DELAY);
  }, [headerAnim, hideHeader]);

  const toggleHeader = useCallback(() => {
    if (headerShownRef.current) {
      hideHeader();
    } else {
      showHeader();
    }
  }, [showHeader, hideHeader]);

  // Show header on mount
  useEffect(() => {
    showHeader();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setPublicationReady(false);
    if (id) openBook(id);
    return () => closeBook();
  }, [id]);

  // When opened from the timeline with a locator param, offer a way back
  // to saved progress — but only if the highlight is on a different page.
  const didSetJumpRef = useRef(false);
  useEffect(() => {
    if (!locatorParam || !savedLocator || didSetJumpRef.current) return;
    try {
      const jumpLoc = JSON.parse(decodeURIComponent(locatorParam)) as Locator;
      const jumpPage = jumpLoc.locations?.position;
      const savedPage = savedLocator.locations?.position;
      if (
        jumpPage !== undefined &&
        savedPage !== undefined &&
        jumpPage === savedPage
      )
        return;
    } catch {
      // parse failed — show banner anyway
    }
    didSetJumpRef.current = true;
    setPreJumpLocator(savedLocator);
  }, [locatorParam, savedLocator]);

  // Navigate back only after the re-render with leaving=true has committed,
  // so the native SurfaceView is gone before the slide animation begins.
  useEffect(() => {
    if (!leaving) return;
    const id = setTimeout(() => router.back(), 32);
    return () => clearTimeout(id);
  }, [leaving]);

  const handleLocationChange = useCallback(
    (loc: Locator) => {
      updateProgress(loc);
    },
    [updateProgress],
  );

  const handlePublicationReady = useCallback(
    (event: PublicationReadyEvent) => {
      setPublicationReady(true);
      setTableOfContents(event.tableOfContents);

      if (currentBook && currentBook.author === "Unknown") {
        const metadata = event.metadata;
        updateBookMetadata(currentBook.id, {
          title: metadata.title || currentBook.title,
          author: metadata.author?.map((c) => c.name).join(", ") || "Unknown",
          totalPages: event.positions?.length || undefined,
        });
      }
    },
    [currentBook, setTableOfContents, updateBookMetadata],
  );

  const handleSelectionAction = useCallback(
    (event: SelectionActionEvent) => {
      if (event.actionId === "highlight") {
        addHighlight(event.selectedText, event.locator);
      }
    },
    [addHighlight],
  );

  const handleDecorationActivated = useCallback(
    (event: DecorationActivatedEvent) => {
      const decoration = event.decoration;
      const highlightData = highlights.find((h) => h.id === decoration.id);
      if (highlightData) {
        setMenuHighlight({
          id: highlightData.id,
          text: highlightData.text,
          color: highlightData.color || "#f2ca50",
          tags: highlightData.tags ? JSON.parse(highlightData.tags) : [],
        });
      }
    },
    [highlights],
  );

  const handleChapterPress = useCallback(
    (link: { href: string }) => {
      // Only save return position if we're navigating to a different chapter
      const sameChapter =
        currentLocator?.href &&
        (currentLocator.href.includes(link.href.split("#")[0]) ||
          link.href.split("#")[0].endsWith(currentLocator.href.split("#")[0]));
      if (currentLocator && !sameChapter) setPreJumpLocator(currentLocator);
      readerRef.current?.goTo({
        href: link.href,
        type: "application/xhtml+xml",
      });
      setShowToc(false);
      showHeader();
    },
    [currentLocator, showHeader],
  );

  const handleHighlightPress = useCallback(
    (locator: Locator) => {
      // Only save return position if the highlight is on a different page
      const samePage =
        currentLocator?.locations?.position === locator.locations?.position &&
        currentLocator?.href === locator.href;
      if (currentLocator && !samePage) setPreJumpLocator(currentLocator);
      readerRef.current?.goTo(locator);
      setShowToc(false);
      showHeader();
    },
    [currentLocator, showHeader],
  );

  const handleReturnToProgress = useCallback(() => {
    if (preJumpLocator) readerRef.current?.goTo(preJumpLocator);
    setPreJumpLocator(null);
  }, [preJumpLocator]);

  const handleDismissReturn = useCallback(() => {
    setPreJumpLocator(null);
  }, []);

  // Match bookmark by href + position + progression for accurate per-page icon.
  // Using all three fields avoids the off-by-one that occurs at page boundaries
  // when position alone is ambiguous.
  const isBookmarked = useMemo(() => {
    if (!currentLocator) return false;
    return bookmarkList.some((bm) => {
      try {
        const loc = JSON.parse(bm.locator) as Locator;
        return (
          loc.href === currentLocator.href &&
          loc.locations?.position === currentLocator.locations?.position &&
          loc.locations?.progression === currentLocator.locations?.progression
        );
      } catch {
        return false;
      }
    });
  }, [bookmarkList, currentLocator]);

  const handleBookmarkToggle = useCallback(async () => {
    if (!currentLocator) return;
    if (isBookmarked) {
      // Remove: match on href + position so we only remove this page's bookmark
      const bm = bookmarkList.find((b) => {
        try {
          const loc = JSON.parse(b.locator) as Locator;
          return (
            loc.href === currentLocator.href &&
            loc.locations?.position === currentLocator.locations?.position
          );
        } catch {
          return false;
        }
      });
      if (bm) removeBookmark(bm.id);
    } else {
      await addBookmark();
      // After adding, find the newly created bookmark and show the note prompt
      const { bookmarkList: updated } = useReaderStore.getState();
      const newBm = updated.find((b) => {
        try {
          const loc = JSON.parse(b.locator) as Locator;
          return (
            loc.href === currentLocator.href &&
            loc.locations?.position === currentLocator.locations?.position
          );
        } catch {
          return false;
        }
      });
      if (newBm) setBookmarkNotePrompt({ id: newBm.id, note: "" });
    }
  }, [currentLocator, isBookmarked, bookmarkList, addBookmark, removeBookmark]);

  const handleBookmarkPress = useCallback(
    (locator: Locator) => {
      // Only save return position if the bookmark is on a different page
      const samePage =
        currentLocator?.locations?.position === locator.locations?.position &&
        currentLocator?.href === locator.href;
      if (currentLocator && !samePage) setPreJumpLocator(currentLocator);
      readerRef.current?.goTo(locator);
      setShowToc(false);
      showHeader();
    },
    [currentLocator, showHeader],
  );

  const decorations: DecorationGroup[] = useMemo(
    () => [
      {
        name: "highlights",
        decorations: highlights
          .filter((h) => h.locator)
          .map((h) => ({
            id: h.id,
            locator: JSON.parse(h.locator!) as Locator,
            style: {
              type: "highlight",
              tint: h.color || colors.primary.default,
            },
          })),
      },
    ],
    [highlights],
  );

  const initialLocation = useMemo(() => {
    if (locatorParam) {
      try {
        return JSON.parse(decodeURIComponent(locatorParam)) as Locator;
      } catch {
        // ignore parse errors
      }
    }
    return savedLocator || undefined;
  }, [locatorParam, savedLocator]);

  // The header zone is a transparent tap strip above the reading area.
  // ReadiumView sits BELOW this zone so its native touch handling is
  // completely unaffected — swipes and text selection work normally.
  const headerZoneHeight = insets.top + HEADER_CONTENT_HEIGHT;

  if (isLoading || !currentBook) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary.default} size="large" />
      </View>
    );
  }

  const progress = currentLocator?.locations?.totalProgression;

  return (
    <View style={styles.container}>
      {/* Transparent tap zone — same height as the header.
          Tapping here toggles the header. ReadiumView is below this,
          so all reading interactions (swipe, selection) are untouched. */}
      <Pressable
        style={[styles.headerTapZone, { height: headerZoneHeight }]}
        onPress={toggleHeader}
      />

      {/* ReadiumView — replaced with a dark placeholder while leaving so the
          native SurfaceView doesn't flash white during the slide animation */}
      {leaving ? (
        <View style={styles.reader} />
      ) : (
        <ReadiumView
          ref={readerRef}
          style={styles.reader}
          file={{
            url: currentBook.filePath!,
            initialLocation,
          }}
          preferences={{
            theme: appTheme === "light" ? "light" : "dark",
            backgroundColor: colors.surface.base,
            textColor: colors.text.primary,
            fontFamily: "serif",
            pageMargins: 1.5,
            lineHeight: 1.6,
          }}
          decorations={decorations}
          selectionActions={selectionActions}
          onLocationChange={handleLocationChange}
          onPublicationReady={handlePublicationReady}
          onSelectionAction={handleSelectionAction}
          onDecorationActivated={handleDecorationActivated}
        />
      )}

      {/* Animated header — absolutely positioned, overlays the tap zone.
          pointerEvents="box-none": container passes touches through,
          buttons (children) intercept their own taps. */}
      <Animated.View
        style={[
          styles.headerOverlay,
          {
            opacity: headerAnim,
            transform: [
              {
                translateY: headerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-headerZoneHeight, 0],
                }),
              },
            ],
          },
        ]}
        pointerEvents="box-none"
      >
        <ReaderHeader
          title={currentBook.title}
          progress={progress}
          isBookmarked={isBookmarked}
          onBookmarkToggle={handleBookmarkToggle}
          onBack={() => setLeaving(true)}
          onContents={() => {
            showHeader();
            setShowToc(true);
          }}
        />
      </Animated.View>

      {/* Bottom page indicator — shows/hides with header */}
      <Animated.View
        style={[
          styles.bottomBar,
          {
            opacity: headerAnim,
            bottom: insets.bottom + spacing[4],
          },
        ]}
        pointerEvents="none"
      >
        <ThemedText type="labelSm" color={colors.text.secondary}>
          {currentLocator?.locations?.position !== undefined &&
          currentBook?.totalPages
            ? `${currentLocator.locations.position} of ${currentBook.totalPages}`
            : progress !== undefined
              ? `${Math.round(progress * 100)}%`
              : ""}
        </ThemedText>
      </Animated.View>

      {/* Highlight menu */}
      {menuHighlight && (
        <HighlightMenu
          visible
          highlightId={menuHighlight.id}
          highlightText={menuHighlight.text}
          currentColor={menuHighlight.color}
          currentTags={menuHighlight.tags}
          allTags={allTags}
          existingNotes={highlightNotes[menuHighlight.id] ?? []}
          onAddNote={addNote}
          onUpdateNote={(noteId, text) =>
            updateNote(noteId, menuHighlight.id, text)
          }
          onDeleteNote={(noteId) => deleteNote(noteId, menuHighlight.id)}
          onDelete={deleteHighlight}
          onUpdateHighlight={updateHighlight}
          onClose={() => setMenuHighlight(null)}
        />
      )}

      {/* Return to progress banner */}
      {preJumpLocator && publicationReady && (
        <View
          style={[styles.returnBanner, { bottom: insets.bottom + spacing[4] }]}
        >
          <Pressable style={styles.returnBtn} onPress={handleReturnToProgress}>
            <ThemedText type="labelSm" color={colors.primary.default}>
              ← RETURN TO PROGRESS
            </ThemedText>
          </Pressable>
          <Pressable
            style={styles.returnDismiss}
            onPress={handleDismissReturn}
            hitSlop={8}
          >
            <ThemedText type="labelSm" color={colors.text.secondary}>
              ✕
            </ThemedText>
          </Pressable>
        </View>
      )}

      <TocSheet
        visible={showToc}
        toc={tableOfContents}
        currentHref={currentLocator?.href}
        highlights={highlights}
        bookmarkItems={bookmarkList}
        onChapterPress={handleChapterPress}
        onHighlightPress={handleHighlightPress}
        onBookmarkPress={handleBookmarkPress}
        onUpdateBookmarkNote={updateBookmarkNote}
        onClose={() => setShowToc(false)}
      />

      {/* Bookmark note prompt — appears after adding a bookmark */}
      {bookmarkNotePrompt && (
        <BookmarkNotePrompt
          note={bookmarkNotePrompt.note}
          onNoteChange={(text) =>
            setBookmarkNotePrompt((p) => p && { ...p, note: text })
          }
          onSave={() => {
            if (bookmarkNotePrompt.note.trim()) {
              updateBookmarkNote(
                bookmarkNotePrompt.id,
                bookmarkNotePrompt.note.trim(),
              );
            }
            setBookmarkNotePrompt(null);
          }}
          onSkip={() => setBookmarkNotePrompt(null)}
          colors={colors}
          top={headerZoneHeight}
        />
      )}
    </View>
  );
}

// ── Bookmark note prompt component ────────────────────────────────────
function BookmarkNotePrompt({
  note,
  onNoteChange,
  onSave,
  onSkip,
  colors,
  top,
}: {
  note: string;
  onNoteChange: (text: string) => void;
  onSave: () => void;
  onSkip: () => void;
  colors: ReturnType<typeof useColors>;
  top: number;
}) {
  return (
    <View
      style={[
        {
          position: "absolute",
          left: spacing[6],
          right: spacing[6],
          top: top + spacing[3],
          backgroundColor: colors.surface.low,
          borderWidth: 1,
          borderColor: colors.surface.highest,
          padding: spacing[4],
          gap: spacing[3],
        },
      ]}
    >
      <ThemedText type="labelSm" color={colors.text.secondary}>
        ADD A NOTE TO THIS BOOKMARK
      </ThemedText>
      <View
        style={{
          backgroundColor: colors.surface.mid,
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[2],
        }}
      >
        <TextInput
          value={note}
          onChangeText={onNoteChange}
          placeholder="What caught your attention here?"
          placeholderTextColor={colors.text.secondary}
          style={{
            color: colors.text.primary,
            fontSize: 14,
            minHeight: 40,
          }}
          multiline
          autoFocus
          returnKeyType="done"
          blurOnSubmit
          onSubmitEditing={onSave}
        />
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          gap: spacing[4],
        }}
      >
        <Pressable onPress={onSkip} hitSlop={8}>
          <ThemedText type="labelSm" color={colors.text.secondary}>
            SKIP
          </ThemedText>
        </Pressable>
        <Pressable onPress={onSave} hitSlop={8}>
          <ThemedText type="labelSm" color={colors.primary.default}>
            SAVE
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

function useReaderStyles(colors: ReturnType<typeof useColors>) {
  return useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.surface.base },
        headerTapZone: { width: "100%" },
        reader: { flex: 1 },
        loading: {
          flex: 1,
          backgroundColor: colors.surface.base,
          alignItems: "center",
          justifyContent: "center",
        },
        headerOverlay: { position: "absolute", top: 0, left: 0, right: 0 },
        bottomBar: {
          position: "absolute",
          left: 0,
          right: 0,
          alignItems: "center",
          paddingVertical: spacing[2],
          backgroundColor: colors.surface.base,
        },
        returnBanner: {
          position: "absolute",
          left: spacing[6],
          right: spacing[6],
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.surface.low,
          borderWidth: 1,
          borderColor: colors.surface.highest,
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[3],
        },
        returnBtn: { flex: 1 },
        returnDismiss: { paddingLeft: spacing[4] },
      }),
    [colors],
  );
}
