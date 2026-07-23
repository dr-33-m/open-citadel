import * as Clipboard from "expo-clipboard";
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
  Alert,
  Animated,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { Touchable } from "@/components/ui/touchable";
import type {
  DecorationActivatedEvent,
  DecorationGroup,
  Locator,
  PublicationReadyEvent,
  ReadiumViewRef,
  SelectionAction,
  SelectionActionEvent,
  SelectionEvent,
  TTSState,
  TTSUtteranceEvent,
} from "@dr33m/react-native-readium";
import { ReadiumView } from "@dr33m/react-native-readium";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HighlightMenu } from "@/components/reader/highlight-menu";
import { ReaderHeader } from "@/components/reader/reader-header";
import { SelectionBar } from "@/components/reader/selection-bar";
import { TocSheet } from "@/components/reader/toc-sheet";
import { TTSControls } from "@/components/reader/tts-controls";
import { ThemedText } from "@/components/themed-text";
import { spacing } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { useBooksStore } from "@/stores/books";
import { useChatStore } from "@/stores/chat";
import { useReaderStore } from "@/stores/reader";
import { useSettingsStore } from "@/stores/settings";
import { extractChapterTextToLocator } from "@/services/book-context";
import { suggestTags } from "@/services/tag-suggest";
import {
  startMediaSession,
  stopMediaSession,
} from "@/services/tts-media-session";

// Height of the header content below the status bar
const HEADER_CONTENT_HEIGHT = 10;

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

  const createChatSession = useChatStore((s) => s.createSession);

  const { updateBookMetadata } = useBooksStore();
  const { ttsVoice, ttsVoiceLanguage, ttsRate } = useSettingsStore();

  const [menuHighlight, setMenuHighlight] = useState<{
    id: string;
    text: string;
    color: string;
    tags: string[];
    chatSessionId: string | null;
    locator: Locator | null;
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

  // TTS
  const [ttsState, setTtsState] = useState<TTSState | null>(null);
  const isTTSActive = ttsState !== null;
  // Tracks the last known TTS utterance locator
  const ttsLastLocatorRef = useRef<Locator | null>(null);
  // Tracks the last utterance TEXT seen during TTS. iOS fires many word-level
  // events per sentence (same text, different locator); Android fires one per
  // utterance. Deduping by text coalesces iOS to sentence granularity and is a
  // no-op on Android.
  const ttsLastUtteranceRef = useRef<string | null>(null);
  // Locator saved when TTS was paused (for resume-or-continue banner)
  const ttsPausedLocatorRef = useRef<Locator | null>(null);
  // Banner shown when user navigates away from paused TTS position
  const [ttsMismatch, setTtsMismatch] = useState(false);
  // For detecting rate changes mid-session
  const prevTtsRateRef = useRef(ttsRate);
  // Always-current locator ref — lets callbacks read the latest locator without stale closure
  const currentLocatorRef = useRef<Locator | null>(null);

  // ── Animated header ────────────────────────────────────────────────
  const headerAnim = useRef(new Animated.Value(1)).current;
  const headerShownRef = useRef(true);

  const hideHeader = useCallback(() => {
    headerShownRef.current = false;
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
  }, [headerAnim]);

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
      currentLocatorRef.current = loc;
      updateProgress(loc);
      // Detect mismatch: TTS is paused but user navigated away (different chapter OR page)
      if (ttsPausedLocatorRef.current) {
        const sameLocation =
          loc.href === ttsPausedLocatorRef.current.href &&
          loc.locations?.position ===
            ttsPausedLocatorRef.current.locations?.position;
        setTtsMismatch(!sameLocation);
      }
    },
    [updateProgress],
  );

  const handlePublicationReady = useCallback(
    (event: PublicationReadyEvent) => {
      setPublicationReady(true);
      setTableOfContents(event.tableOfContents);

      if (currentBook) {
        const updates: {
          title?: string;
          author?: string;
          totalPages?: number;
          coverUrl?: string;
        } = { totalPages: event.positions?.length || undefined };

        if (currentBook.author === "Unknown") {
          const metadata = event.metadata;
          if (!currentBook.titleLocked) {
            updates.title =
              metadata.title && metadata.title !== "Untitled"
                ? metadata.title
                : currentBook.title;
          }
          updates.author =
            metadata.author?.map((c) => c.name).join(", ") || "Unknown";
        }

        // Save cover extracted by Readium (first open only)
        if (event.coverPath && !currentBook.coverUrl) {
          updates.coverUrl = event.coverPath;
        }

        updateBookMetadata(currentBook.id, updates);
      }
    },
    [currentBook, setTableOfContents, updateBookMetadata],
  );

  // Text selection
  const [selectionEvent, setSelectionEvent] = useState<{
    text: string;
    locator: Locator;
  } | null>(null);

  const handleSelectionChange = useCallback((event: SelectionEvent) => {
    if (event.selectedText && event.locator) {
      setSelectionEvent({ text: event.selectedText, locator: event.locator });
    } else {
      setSelectionEvent(null);
    }
  }, []);

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
          chatSessionId: highlightData.chatSessionId ?? null,
          locator: highlightData.locator ? JSON.parse(highlightData.locator) as Locator : null,
        });
      }
    },
    [highlights],
  );

  const [chatLoading, setChatLoading] = useState(false);

  const startChatFromSelection = useCallback(
    async (text: string, locator: Locator) => {
      if (!currentBook || chatLoading) return;

      setChatLoading(true);
      let contextText = text;
      if (currentBook.filePath) {
        try {
          contextText = await extractChapterTextToLocator(currentBook.filePath, locator);
        } catch {
          // fallback to selected text only
        }
      }

      // Create a highlight and a chat session, then link them
      const highlightId = await addHighlight(text, locator);
      const sessionId = await createChatSession({
        bookId: currentBook.id,
        title: text.slice(0, 60),
        contextText,
        contextLocator: JSON.stringify(locator),
      });
      // Link the highlight to the chat session
      await updateHighlight(highlightId, { chatSessionId: sessionId });

      setChatLoading(false);
      setSelectionEvent(null);
      router.push({ pathname: '/chat/[id]', params: { id: sessionId } });
    },
    [currentBook, chatLoading, addHighlight, updateHighlight, createChatSession, router],
  );

  // Android: the custom SelectionBar drives this from onSelectionChange state.
  const handleChatFromSelection = useCallback(() => {
    if (!selectionEvent) return;
    startChatFromSelection(selectionEvent.text, selectionEvent.locator);
  }, [selectionEvent, startChatFromSelection]);

  // iOS: Readium never fires onSelectionChange, so selection surfaces through the
  // native selection menu (the idiomatic iOS pattern). The menu items below route
  // here and act in one tap. Android instead uses the custom top SelectionBar.
  const handleSelectionAction = useCallback(
    (event: SelectionActionEvent) => {
      const { actionId, selectedText, locator } = event;
      if (!selectedText || !locator) return;
      if (actionId === "highlight") {
        addHighlight(selectedText, locator);
      } else if (actionId === "copy") {
        Clipboard.setStringAsync(selectedText);
      } else if (actionId === "chat") {
        startChatFromSelection(selectedText, locator);
      }
    },
    [addHighlight, startChatFromSelection],
  );

  const handleChatFromHighlight = useCallback(async (
    highlightId: string,
    text: string,
    locator: Locator | null,
    existingChatSessionId?: string | null,
  ) => {
    // Navigate to existing chat session if one is already linked
    if (existingChatSessionId) {
      setMenuHighlight(null);
      router.push({ pathname: '/chat/[id]', params: { id: existingChatSessionId } });
      return;
    }

    if (!currentBook || chatLoading) return;
    setChatLoading(true);
    let contextText = text;
    if (currentBook.filePath && locator) {
      try {
        contextText = await extractChapterTextToLocator(currentBook.filePath, locator);
      } catch {
        // fallback to selected text only
      }
    }
    const sessionId = await createChatSession({
      bookId: currentBook.id,
      title: text.slice(0, 60),
      contextText,
      contextLocator: locator ? JSON.stringify(locator) : undefined,
    });
    await updateHighlight(highlightId, { chatSessionId: sessionId });
    setChatLoading(false);
    setMenuHighlight(null);
    router.push({ pathname: '/chat/[id]', params: { id: sessionId } });
  }, [currentBook, chatLoading, createChatSession, updateHighlight, router]);

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

  const handleTTSStateChange = useCallback((state: TTSState) => {
    if (!state.isPlaying && !state.isPaused) {
      setTtsState(null);
      ttsPausedLocatorRef.current = null;
      ttsLastUtteranceRef.current = null;
      stopMediaSession();
    } else {
      setTtsState(state);
      if (state.isPaused) {
        // Snapshot the current utterance locator so we can resume from here
        ttsPausedLocatorRef.current = ttsLastLocatorRef.current;
      } else {
        // Playing — clear the paused snapshot and any mismatch banner
        ttsPausedLocatorRef.current = null;
        setTtsMismatch(false);
      }
    }
  }, []);

  const handleTTSUtterance = useCallback((event: TTSUtteranceEvent) => {
    // Dedup: iOS fires many word-level events per sentence (same text, different
    // locator); Android fires one per utterance. Deduping reduces bridge traffic
    // on iOS and is a no-op on Android.
    if (event.utterance === ttsLastUtteranceRef.current) return;
    ttsLastUtteranceRef.current = event.utterance;
    ttsLastLocatorRef.current = event.locator;

    // Page-turn: only call goTo when the utterance crosses a virtual page boundary.
    // Calling goTo on every utterance causes webview reflows that compete with audio.
    const newPosition = event.locator.locations?.position;
    const currentPosition = currentLocatorRef.current?.locations?.position;
    if (newPosition === undefined || newPosition !== currentPosition) {
      readerRef.current?.goTo(event.locator);
    }
  }, []);

  const handleTTSToggle = useCallback(() => {
    if (!isTTSActive) {
      setTtsMismatch(false);
      readerRef.current?.ttsStart({
        voice: ttsVoice ?? undefined,
        language: ttsVoiceLanguage ?? undefined,
        rate: ttsRate,
      });
      setTtsState({ isPlaying: true, isPaused: false, rate: ttsRate });
      startMediaSession(
        currentBook?.title ?? "Reading",
        currentBook?.author ?? "",
        currentBook?.coverUrl ?? null,
      );
    } else {
      readerRef.current?.ttsStop();
      setTtsState(null);
      setTtsMismatch(false);
      ttsPausedLocatorRef.current = null;
      ttsLastUtteranceRef.current = null;
      stopMediaSession();
    }
  }, [isTTSActive, ttsVoice, ttsVoiceLanguage, ttsRate, currentBook]);

  const handleTTSPlayPause = useCallback(() => {
    if (ttsState?.isPlaying) {
      readerRef.current?.ttsPause();
    } else {
      readerRef.current?.ttsResume();
    }
  }, [ttsState]);

  const handleTTSError = useCallback((error: string) => {
    setTtsState(null);
    Alert.alert(
      "TTS Unavailable",
      error || "Text-to-speech is not supported for this file.",
    );
  }, []);

  // Resume TTS from the paused position (navigate back + resume)
  const handleTTSResumeFromPaused = useCallback(() => {
    if (ttsPausedLocatorRef.current) {
      readerRef.current?.goTo(ttsPausedLocatorRef.current);
    }
    setTtsMismatch(false);
    readerRef.current?.ttsResume();
  }, []);

  // Dismiss banner and restart TTS from the current visible page
  const handleTTSContinueFromHere = useCallback(() => {
    setTtsMismatch(false);
    ttsPausedLocatorRef.current = null;
    readerRef.current?.ttsStop();
    // Capture current locator now (before any async delays lose it)
    const targetLocator = currentLocatorRef.current;
    setTimeout(() => {
      // Explicitly navigate to anchor the EPUB navigator at the current page.
      // This ensures navigator.currentLocator.value is correct when ttsStart
      // reads it to pick the fromLocator.
      if (targetLocator) readerRef.current?.goTo(targetLocator);
      setTimeout(() => {
        readerRef.current?.ttsStart({
          voice: ttsVoice ?? undefined,
          language: ttsVoiceLanguage ?? undefined,
          rate: ttsRate,
        });
      }, 150);
    }, 100);
  }, [ttsVoice, ttsVoiceLanguage, ttsRate]);

  // Rate sync: if the user changes rate in Settings while TTS is playing, restart
  // so audio and highlight are always in sync at the new speed.
  useEffect(() => {
    const rateChanged = prevTtsRateRef.current !== ttsRate;
    prevTtsRateRef.current = ttsRate;
    if (rateChanged && isTTSActive) {
      readerRef.current?.ttsStop();
      setTtsState(null);
      setTimeout(() => {
        readerRef.current?.ttsStart({
          voice: ttsVoice ?? undefined,
          language: ttsVoiceLanguage ?? undefined,
          rate: ttsRate,
        });
        setTtsState({ isPlaying: true, isPaused: false, rate: ttsRate });
      }, 200);
    }
  }, [ttsRate]); // intentionally only ttsRate — isTTSActive read inline


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

  // TTS decoration is now applied natively (BaseReaderFragment / HybridReadiumView),
  // so this prop only needs to manage user highlights.
  const decorations: DecorationGroup[] = useMemo(() => [
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
  ], [highlights, colors]);

  // iOS: onSelectionChange never fires, so selection is handled via the native
  // menu. These become the menu items (Readium replaces the default iOS actions
  // when custom ones are supplied) and act in one tap via handleSelectionAction.
  // Android uses the custom SelectionBar via onSelectionChange and needs none.
  // Must be present before the book loads on iOS.
  const selectionActions: SelectionAction[] = useMemo(
    () =>
      Platform.OS === "ios"
        ? [
            { id: "highlight", label: "Highlight" },
            { id: "copy", label: "Copy" },
            { id: "chat", label: "Chat" },
          ]
        : [],
    [],
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

  if (isLoading || !currentBook || !currentBook.filePath) {
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
      <Touchable
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
          suppressNativeSelectionMenu={true}
          onLocationChange={handleLocationChange}
          onPublicationReady={handlePublicationReady}
          onSelectionChange={handleSelectionChange}
          onSelectionAction={handleSelectionAction}
          onDecorationActivated={handleDecorationActivated}
          onTTSStateChange={handleTTSStateChange}
          onTTSUtterance={handleTTSUtterance}
          onTTSError={handleTTSError}
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
          isTTSActive={isTTSActive}
          onBookmarkToggle={handleBookmarkToggle}
          onBack={() => {
            if (isTTSActive) {
              readerRef.current?.ttsStop();
              stopMediaSession();
            }
            setLeaving(true);
          }}
          onContents={() => {
            showHeader();
            setShowToc(true);
          }}
          onTTSToggle={handleTTSToggle}
          onToggle={toggleHeader}
        />
      </Animated.View>

      {/* TTS controls — float at bottom, animate in/out with header */}
      {isTTSActive && (
        <Animated.View
          style={[
            styles.bottomFloating,
            {
              opacity: headerAnim,
              bottom: insets.bottom + spacing[4],
              transform: [
                {
                  translateY: headerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [60, 0],
                  }),
                },
              ],
            },
          ]}
          pointerEvents="box-none"
        >
          <TTSControls
            isPlaying={ttsState?.isPlaying ?? false}
            onPlayPause={handleTTSPlayPause}
            onSkipPrevious={() => readerRef.current?.ttsSkipPrevious()}
            onSkipNext={() => readerRef.current?.ttsSkipNext()}
          />
        </Animated.View>
      )}

      {/* Page indicator — floating pill, shows/hides with header when TTS is off */}
      {!isTTSActive && !selectionEvent && (
        <Animated.View
          style={[
            styles.bottomFloating,
            {
              opacity: headerAnim,
              bottom: insets.bottom + spacing[4],
              transform: [
                {
                  translateY: headerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [60, 0],
                  }),
                },
              ],
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.progressPill}>
            <ThemedText type="labelSm" color={colors.text.secondary}>
              {currentLocator?.locations?.position !== undefined &&
              currentBook?.totalPages
                ? `${currentLocator.locations.position} of ${currentBook.totalPages}`
                : progress !== undefined
                  ? `${Math.round(progress * 100)}%`
                  : ""}
            </ThemedText>
          </View>
        </Animated.View>
      )}

      {/* Selection bar — appears when user selects text, positioned just below the header */}
      {selectionEvent && (
        <View
          style={[styles.topFloating, { top: headerZoneHeight + spacing[2] }]}
          pointerEvents="box-none"
        >
          <SelectionBar
            selectedText={selectionEvent.text}
            onHighlight={() => {
              addHighlight(selectionEvent.text, selectionEvent.locator);
              setSelectionEvent(null);
            }}
            onCopy={() => {
              Clipboard.setStringAsync(selectionEvent.text);
              setSelectionEvent(null);
            }}
            onChat={handleChatFromSelection}
            chatLoading={chatLoading}
          />
        </View>
      )}

      {/* Highlight menu */}
      {menuHighlight && (
        <HighlightMenu
          visible
          highlightId={menuHighlight.id}
          highlightText={menuHighlight.text}
          currentColor={menuHighlight.color}
          currentTags={menuHighlight.tags}
          chatSessionId={menuHighlight.chatSessionId}
          allTags={allTags}
          existingNotes={highlightNotes[menuHighlight.id] ?? []}
          bookTitle={currentBook?.title ?? ""}
          authorName={currentBook?.author ?? ""}
          bookCoverUri={currentBook?.coverUrl ?? null}
          bookCategory={currentBook?.category ?? null}
          onAddNote={addNote}
          onUpdateNote={(noteId, text) =>
            updateNote(noteId, menuHighlight.id, text)
          }
          onDeleteNote={(noteId) => deleteNote(noteId, menuHighlight.id)}
          onDelete={deleteHighlight}
          onUpdateHighlight={updateHighlight}
          onStartChat={() =>
            handleChatFromHighlight(
              menuHighlight.id,
              menuHighlight.text,
              menuHighlight.locator,
              menuHighlight.chatSessionId,
            )
          }
          onSuggestTags={async () => {
            const row = useReaderStore
              .getState()
              .highlights.find((h) => h.id === menuHighlight.id);
            let surrounding: string | undefined;
            if (row?.context) {
              try {
                const { before, after } = JSON.parse(row.context) as {
                  before?: string;
                  after?: string;
                };
                surrounding = [before, after].filter(Boolean).join(" … ") || undefined;
              } catch {
                // Suggest from the highlight text alone.
              }
            }
            const noteText = (highlightNotes[menuHighlight.id] ?? [])
              .map((n) => n.text)
              .join("\n");
            return suggestTags({
              text: menuHighlight.text,
              note: noteText || undefined,
              surrounding,
              bookTitle: currentBook?.title,
              author: currentBook?.author,
              existingTags: allTags,
            });
          }}
          onClose={() => setMenuHighlight(null)}
        />
      )}

      {/* Return to progress banner — hidden when TTS is active to avoid conflicting banners */}
      {preJumpLocator && publicationReady && !isTTSActive && (
        <View
          style={[styles.returnBanner, { bottom: insets.bottom + spacing[4] }]}
        >
          <Touchable style={styles.returnBtn} onPress={handleReturnToProgress}>
            <ThemedText type="labelSm" color={colors.primary.default}>
              ← RETURN TO PROGRESS
            </ThemedText>
          </Touchable>
          <Touchable
            style={styles.returnDismiss}
            onPress={handleDismissReturn}
            hitSlop={8}
          >
            <ThemedText type="labelSm" color={colors.text.secondary}>
              ✕
            </ThemedText>
          </Touchable>
        </View>
      )}

      {/* TTS page-mismatch banner — shown when TTS is paused and user navigates away */}
      {ttsMismatch && isTTSActive && (
        <View
          style={[
            styles.returnBanner,
            { bottom: insets.bottom + spacing[4] + 60 },
          ]}
        >
          <Touchable
            style={styles.returnBtn}
            onPress={handleTTSResumeFromPaused}
          >
            <ThemedText type="labelSm" color={colors.primary.default}>
              ← RESUME FROM PAUSED
            </ThemedText>
          </Touchable>
          <Touchable
            style={styles.returnBtn}
            onPress={handleTTSContinueFromHere}
          >
            <ThemedText type="labelSm" color={colors.text.secondary}>
              READ FROM HERE
            </ThemedText>
          </Touchable>
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
        <Touchable onPress={onSkip} hitSlop={8}>
          <ThemedText type="labelSm" color={colors.text.secondary}>
            SKIP
          </ThemedText>
        </Touchable>
        <Touchable onPress={onSave} hitSlop={8}>
          <ThemedText type="labelSm" color={colors.primary.default}>
            SAVE
          </ThemedText>
        </Touchable>
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
        bottomFloating: {
          position: "absolute",
          left: 0,
          right: 0,
          alignItems: "center",
        },
        topFloating: {
          position: "absolute",
          left: 0,
          right: 0,
          alignItems: "center",
        },
        progressPill: {
          backgroundColor: colors.surface.mid,
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[2],
          borderRadius: 20,
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
