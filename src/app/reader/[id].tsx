import { useLocalSearchParams, useRouter } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReadiumView } from 'react-native-readium';
import type {
  Locator,
  DecorationGroup,
  SelectionAction,
  SelectionActionEvent,
  DecorationActivatedEvent,
  PublicationReadyEvent,
} from 'react-native-readium';
import type { ReadiumViewRef } from 'react-native-readium';

import { ThemedText } from '@/components/themed-text';
import { ReaderHeader } from '@/components/reader/reader-header';
import { HighlightMenu } from '@/components/reader/highlight-menu';
import { TocSheet } from '@/components/reader/toc-sheet';
import { colors, spacing } from '@/constants/theme';
import { useReaderStore } from '@/stores/reader';
import { useBooksStore } from '@/stores/books';

const selectionActions: SelectionAction[] = [
  { id: 'highlight', label: 'Highlight' },
];

const HEADER_HIDE_DELAY = 4000;
// Height of the header content below the status bar
const HEADER_CONTENT_HEIGHT = 52;

export default function ReaderScreen() {
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
    highlights,
    highlightNotes,
    allTags,
    tableOfContents,
    isLoading,
    openBook,
    updateProgress,
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
      if (jumpPage !== undefined && savedPage !== undefined && jumpPage === savedPage) return;
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
    [updateProgress]
  );

  const handlePublicationReady = useCallback(
    (event: PublicationReadyEvent) => {
      setPublicationReady(true);
      setTableOfContents(event.tableOfContents);

      if (currentBook && currentBook.author === 'Unknown') {
        const metadata = event.metadata;
        updateBookMetadata(currentBook.id, {
          title: metadata.title || currentBook.title,
          author:
            metadata.author?.map((c) => c.name).join(', ') || 'Unknown',
          totalPages: event.positions?.length || undefined,
        });
      }
    },
    [currentBook, setTableOfContents, updateBookMetadata]
  );

  const handleSelectionAction = useCallback(
    (event: SelectionActionEvent) => {
      if (event.actionId === 'highlight') {
        addHighlight(event.selectedText, event.locator);
      }
    },
    [addHighlight]
  );

  const handleDecorationActivated = useCallback(
    (event: DecorationActivatedEvent) => {
      const decoration = event.decoration;
      const highlightData = highlights.find((h) => h.id === decoration.id);
      if (highlightData) {
        setMenuHighlight({
          id: highlightData.id,
          text: highlightData.text,
          color: highlightData.color || '#f2ca50',
          tags: highlightData.tags ? JSON.parse(highlightData.tags) : [],
        });
      }
    },
    [highlights]
  );

  const handleChapterPress = useCallback(
    (link: { href: string }) => {
      if (currentLocator) setPreJumpLocator(currentLocator);
      readerRef.current?.goTo({ href: link.href, type: 'application/xhtml+xml' });
      setShowToc(false);
      showHeader();
    },
    [currentLocator, showHeader]
  );

  const handleHighlightPress = useCallback(
    (locator: Locator) => {
      if (currentLocator) setPreJumpLocator(currentLocator);
      readerRef.current?.goTo(locator);
      setShowToc(false);
      showHeader();
    },
    [currentLocator, showHeader]
  );

  const handleReturnToProgress = useCallback(() => {
    if (preJumpLocator) readerRef.current?.goTo(preJumpLocator);
    setPreJumpLocator(null);
  }, [preJumpLocator]);

  const handleDismissReturn = useCallback(() => {
    setPreJumpLocator(null);
  }, []);

  const decorations: DecorationGroup[] = useMemo(
    () => [
      {
        name: 'highlights',
        decorations: highlights
          .filter((h) => h.locator)
          .map((h) => ({
            id: h.id,
            locator: JSON.parse(h.locator!) as Locator,
            style: {
              type: 'highlight',
              tint: h.color || colors.primary.default,
            },
          })),
      },
    ],
    [highlights]
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
            theme: 'dark',
            backgroundColor: colors.surface.base,
            textColor: colors.text.primary,
            fontFamily: 'serif',
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
              : ''}
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
          onUpdateNote={(noteId, text) => updateNote(noteId, menuHighlight.id, text)}
          onDeleteNote={(noteId) => deleteNote(noteId, menuHighlight.id)}
          onDelete={deleteHighlight}
          onUpdateHighlight={updateHighlight}
          onClose={() => setMenuHighlight(null)}
        />
      )}


      {/* Table of contents sheet */}
      {/* Return to progress banner */}
      {preJumpLocator && publicationReady && (
        <View style={[styles.returnBanner, { bottom: insets.bottom + spacing[4] }]}>
          <Pressable style={styles.returnBtn} onPress={handleReturnToProgress}>
            <ThemedText type="labelSm" color={colors.primary.default}>
              ← RETURN TO PROGRESS
            </ThemedText>
          </Pressable>
          <Pressable style={styles.returnDismiss} onPress={handleDismissReturn} hitSlop={8}>
            <ThemedText type="labelSm" color={colors.text.secondary}>✕</ThemedText>
          </Pressable>
        </View>
      )}

      <TocSheet
        visible={showToc}
        toc={tableOfContents}
        currentHref={currentLocator?.href}
        highlights={highlights}
        onChapterPress={handleChapterPress}
        onHighlightPress={handleHighlightPress}
        onClose={() => setShowToc(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.base,
  },
  headerTapZone: {
    width: '100%',
    // transparent — just a touch target
  },
  reader: {
    flex: 1,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.surface.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingVertical: spacing[2],
    backgroundColor: colors.surface.base,
  },
  returnBanner: {
    position: 'absolute',
    left: spacing[6],
    right: spacing[6],
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.low,
    borderWidth: 1,
    borderColor: colors.surface.highest,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  returnBtn: {
    flex: 1,
  },
  returnDismiss: {
    paddingLeft: spacing[4],
  },
});
