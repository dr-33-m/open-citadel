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
  Alert,
  Animated,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { Skeleton } from "@/components/ui/skeleton";
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
import { useCSSVariable } from "uniwind";

import { HighlightMenu } from "@/components/reader/highlight-menu";
import { ReaderHeader, READER_HEADER_HEIGHT } from "@/components/reader/reader-header";
import { SelectionBar } from "@/components/reader/selection-bar";
import { TocSheet } from "@/components/reader/toc-sheet";
import { TTSControls } from "@/components/reader/tts-controls";
import { ThemedText } from "@/components/themed-text";
import { spacing } from "@/constants/theme";
import { asColor } from "@/utils/colors";
import { useBooksStore } from "@/stores/books";
import { useChatStore } from "@/stores/chat";
import { useReaderStore } from "@/stores/reader";
import { useSettingsStore } from "@/stores/settings";
import { useScreenSettled } from "@/navigation/use-screen-settled";
import { extractChapterTextToLocator } from "@/services/book-context";
import { suggestTags } from "@/services/tag-suggest";
import {
  startMediaSession,
  stopMediaSession,
} from "@/services/tts-media-session";

// Height of the header content below the status bar. Read from the header
// itself rather than guessed: this number is what the reading area reserves
// for it, and an under-guess is invisible in code and very visible on a page.
const HEADER_CONTENT_HEIGHT = READER_HEADER_HEIGHT;

// Reserved space above the bottom safe area for the floating TTS controls /
// page indicator, so paginated text never renders underneath them
const FOOTER_CONTROLS_HEIGHT = spacing[16];

const isAndroid = process.env.EXPO_OS === "android";

/**
 * The reading area's placeholder: full-measure serif lines in the reader's own
 * gutters, ending mid-line the way a page does.
 *
 * Shared by the two waits this screen has — the book decoding, and the gap
 * between the screen arriving and Readium's first paint — so they read as one
 * continuous load instead of a skeleton that hands over to a black rectangle.
 * `label` belongs on whichever copy stands for the region; a second labelled
 * copy would announce the wait twice.
 */
/**
 * The placeholder's line rhythm: mostly full measure, with a short line where
 * a paragraph ends. Enough entries to overrun the tallest phone — the block
 * is clipped to the reading area, so the text runs to the bottom of the page
 * the way a real one does instead of stopping halfway down and leaving the
 * lower half of the screen empty.
 *
 * Whole class strings rather than an interpolated width: the styling compiler
 * only sees classes written out in full.
 */
const READING_SKELETON_LINES = [
  "h-4 w-full", "h-4 w-[92%]", "h-4 w-[97%]", "h-4 w-[88%]",
  "h-4 w-[95%]", "h-4 w-[58%]", "h-4 w-[94%]", "h-4 w-full",
  "h-4 w-[85%]", "h-4 w-[96%]", "h-4 w-[90%]", "h-4 w-[66%]",
  "h-4 w-[93%]", "h-4 w-full", "h-4 w-[89%]", "h-4 w-[97%]",
  "h-4 w-[91%]", "h-4 w-[52%]", "h-4 w-[96%]", "h-4 w-[87%]",
  "h-4 w-full", "h-4 w-[94%]", "h-4 w-[90%]", "h-4 w-[71%]",
  "h-4 w-[95%]", "h-4 w-full", "h-4 w-[88%]", "h-4 w-[93%]",
  "h-4 w-[86%]", "h-4 w-[61%]", "h-4 w-[97%]", "h-4 w-[92%]",
  "h-4 w-full", "h-4 w-[89%]", "h-4 w-[94%]", "h-4 w-[68%]",
];

function ReadingSkeleton({ label }: { label?: string }) {
  return (
    <View
      className="flex-1 gap-3 px-6"
      style={{ marginTop: spacing[8], overflow: "hidden" }}
    >
      {READING_SKELETON_LINES.map((line, index) => (
        <Skeleton
          key={`${line}-${index}`}
          className={line}
          label={index === 0 ? label : undefined}
        />
      ))}
    </View>
  );
}

export default function ReaderScreen() {
  const appTheme = useSettingsStore((s) => s.theme);
  const [background, foreground, primary, mutedForeground] = useCSSVariable([
    "--color-background",
    "--color-foreground",
    "--color-primary",
    "--color-muted-foreground",
  ]);
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
  // Open/closed is its own flag rather than `menuHighlight !== null`: the
  // sheet needs its content for the length of its exit animation, and
  // clearing the highlight to close would unmount the sheet mid-slide.
  // The stale highlight costs nothing — a closed sheet renders no content.
  const [menuOpen, setMenuOpen] = useState(false);
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

  // Readium is the heaviest mount in the app — a WebView plus fragment
  // inflation, all on the main thread — and mounting it in the same frames as
  // this screen's entry transition is what starves that transition's native
  // commit (measured: 48-82 dropped frames right after the WebView is created,
  // and a screen left painting at a stale transform while every JS-side value
  // says it has arrived). Waiting for the transition to settle takes the two
  // apart; `ReadingSkeleton` below covers the wait, so nothing is gained by
  // racing it.
  //
  // Latched, not live: `useScreenSettled` goes false again on blur, and letting
  // that unmount `ReadiumView` would tear the book down and reload it every
  // time the reader is covered by a chat or a section screen. Mount once the
  // entrance has landed, and stay mounted.
  // Adjusted during render rather than in an effect (the same escape hatch
  // `components/ui/sheet` uses): the latch is derived from `settled`, and an
  // effect would cost an extra commit before the reader could mount.
  const settled = useScreenSettled();
  const [readerMounted, setReaderMounted] = useState(false);
  if (settled && !readerMounted) setReaderMounted(true);

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
        setMenuOpen(true);
      }
    },
    [highlights],
  );

  const [chatLoading, setChatLoading] = useState(false);

  const startChatFromSelection = useCallback(
    async (text: string, locator: Locator) => {
      if (!currentBook || chatLoading) return;

      setChatLoading(true);
      let contextText: string | undefined;
      if (currentBook.filePath) {
        try {
          contextText = await extractChapterTextToLocator(currentBook.filePath, locator);
        } catch {
          // fallback to selected text only — no separate background context
        }
      }

      // Create a highlight and a chat session, then link them
      const highlightId = await addHighlight(text, locator);
      const sessionId = await createChatSession({
        bookId: currentBook.id,
        title: text.slice(0, 60),
        contextText,
        passageText: text,
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
      setMenuOpen(false);
      router.push({ pathname: '/chat/[id]', params: { id: existingChatSessionId } });
      return;
    }

    if (!currentBook || chatLoading) return;
    setChatLoading(true);
    let contextText: string | undefined;
    if (currentBook.filePath && locator) {
      try {
        contextText = await extractChapterTextToLocator(currentBook.filePath, locator);
      } catch {
        // fallback to selected text only — no separate background context
      }
    }
    const sessionId = await createChatSession({
      bookId: currentBook.id,
      title: text.slice(0, 60),
      contextText,
      passageText: text,
      contextLocator: locator ? JSON.stringify(locator) : undefined,
    });
    await updateHighlight(highlightId, { chatSessionId: sessionId });
    setChatLoading(false);
    setMenuOpen(false);
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
            tint: h.color || asColor(primary),
          },
        })),
    },
  ], [highlights, primary]);

  // iOS: onSelectionChange never fires, so selection is handled via the native
  // menu. These become the menu items (Readium replaces the default iOS actions
  // when custom ones are supplied) and act in one tap via handleSelectionAction.
  // Android uses the custom SelectionBar via onSelectionChange and needs none.
  // Must be present before the book loads on iOS.
  const selectionActions: SelectionAction[] = useMemo(
    () =>
      process.env.EXPO_OS === "ios"
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

  // Where the reading area's top edge sits.
  //
  // Readium's Android navigator pads its own reading area before it lays out
  // a single line: the display-cutout safe inset, plus a fixed 40dp of
  // vertical breathing room, top and bottom (`R2EpubPageFragment` and
  // `readium_navigator_epub_vertical_padding` in the navigator's resources).
  // None of that is visible from here, and it stacks on top of whatever this
  // screen reserves — which is how the first line of every page ended up
  // ~150dp down the screen while the last lines ran off the bottom edge.
  //
  // So the frame is placed to absorb that padding rather than sit under it:
  // on Android its top edge is pulled up by exactly `insets.top`, which the
  // cutout half of Readium's padding then pushes straight back down. What is
  // left over is the 40dp, which is the gap the page actually shows — and it
  // matches the 40dp Readium leaves at the bottom, so the text block sits
  // evenly between the header and the screen edge. The overlap costs nothing:
  // the band the frame gains is inside Readium's own blank padding, so no
  // text ever renders under the header.
  const readerTop = isAndroid ? HEADER_CONTENT_HEIGHT : headerZoneHeight;

  // Reserved space below the reading area, covering the home indicator safe
  // area and — while TTS is running — room for the floating controls, which
  // are centered within the FULL zone so the gap above them (to the text)
  // matches the gap below them (to the screen edge).
  //
  // Only while TTS is running. Held open unconditionally it cost every silent
  // reading page ~64dp of blank below the last line, for controls that were
  // not on screen. Reading takes that space back and TTS borrows it, at the
  // cost of one repagination when TTS starts, which is a mode change the
  // reader is already asking for. The transient banners below still float
  // over the text rather than reserving against it: they are dismissible and
  // short-lived, and repaginating the page under the reader to announce one
  // would be a far bigger interruption than the two lines they cover.
  //
  // Silent Android reading reserves nothing at all: Readium's own 40dp of
  // bottom padding is already there, and it is what the gap under the header
  // is balanced against. iOS keeps its own — the navigator there pads far
  // less.
  // Constant, whatever TTS is doing.
  //
  // This used to add `FOOTER_CONTROLS_HEIGHT` while TTS was active, which
  // changed the reading area's height and so the WebView's. Readium
  // repaginates on a viewport change, so the same chapter split into a
  // different number of pages: the position moved under the reader, the
  // passage visibly shrank, and stopping TTS repaginated back and landed
  // several pages from where the voice had reached.
  //
  // The controls never needed the text to make room — they are an absolutely
  // positioned overlay (below), like the banners. This is the same call the
  // note above already makes for those: floating over two lines is a far
  // smaller interruption than repaginating the page under the reader.
  const footerZoneHeight = insets.bottom + (isAndroid ? 0 : spacing[6]);

  // The overlay's own height, which is free to change because nothing lays
  // out against it.
  const ttsControlsZoneHeight = insets.bottom + FOOTER_CONTROLS_HEIGHT;

  if (isLoading || !currentBook || !currentBook.filePath) {
    // Skeleton, not a spinner: the reader's chrome shape is known before the
    // book decodes (header bar over a block of serif lines), so the
    // placeholder mirrors it and the real layout settles in place instead of
    // swapping out of a centered spinner. Readium wiring is untouched — this
    // is only the loading branch.
    return (
      <View className="flex-1 bg-background">
        {/* Header bar: back control, title line, trailing icon cluster. */}
        <View
          className="flex-row items-center gap-2 px-4"
          style={{ paddingTop: insets.top + spacing[2], paddingBottom: spacing[3] }}
        >
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </View>
        {/* Text block: full-measure paragraphs that end mid-line, in the
            reader's own side gutters. One skeleton carries the region's
            screen-reader label. */}
        <ReadingSkeleton label="Loading book" />
      </View>
    );
  }

  const progress = currentLocator?.locations?.totalProgression;

  return (
    <View className="flex-1 bg-background">
      {/* Holds the reading area's top edge. */}
      <View pointerEvents="none" style={{ height: readerTop }} />

      {/* The reading area. ReadiumView fills it absolutely rather than
          flexing: the native view resolves `flex: 1` against the full screen
          instead of the space its siblings leave, which sized it a whole
          header taller than its own frame and ran the last lines of every
          page off the bottom edge. A plain RN parent flexes correctly, and an
          absolute fill inside one cannot get its height wrong.

          Empty while leaving so the native SurfaceView doesn't flash white
          during the slide animation, and not mounted until the entrance has
          settled — see the note on `readerMounted`. */}
      <View className="flex-1" style={{ marginBottom: footerZoneHeight }}>
        {leaving || !readerMounted ? null : (
          <ReadiumView
            ref={readerRef}
            style={StyleSheet.absoluteFill}
            file={{
              url: currentBook.filePath!,
              initialLocation,
            }}
            preferences={{
              theme: appTheme === "light" ? "light" : "dark",
              backgroundColor: asColor(background),
              textColor: asColor(foreground),
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

        {/* Covers the reading area until Readium has actually painted a page.
            Two gaps close here, and they used to look like two different
            things: the deferred mount above, and Readium's own decode after it
            mounts — which draws nothing, so the area was a black rectangle
            sitting under the header. Same placeholder as the loading branch,
            so arriving at a book is one continuous wait. `pointerEvents=none`
            keeps the page-turn taps reaching the reader underneath the moment
            it is live. */}
        {!publicationReady && (
          <View
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            className="bg-background"
          >
            <ReadingSkeleton />
          </View>
        )}
      </View>

      {/* Transparent tap zone over the header. Sits above the reading area so
          a tap on the bar's own background toggles the header rather than
          reaching the page underneath. */}
      <Touchable
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: headerZoneHeight,
        }}
        onPress={toggleHeader}
      />

      {/* Animated header — absolutely positioned, overlays the tap zone.
          pointerEvents="box-none": container passes touches through,
          buttons (children) intercept their own taps. */}
      <Animated.View
        style={[
          { position: "absolute", top: 0, left: 0, right: 0 },
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
            {
              position: "absolute",
              left: 0,
              right: 0,
              alignItems: "center",
              justifyContent: "center",
            },
            {
              opacity: headerAnim,
              bottom: 0,
              height: ttsControlsZoneHeight,
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

      {/* Selection bar — appears when user selects text, positioned just below the header */}
      {selectionEvent && (
        <View
          className="absolute left-0 right-0 items-center"
          style={{ top: headerZoneHeight + spacing[2] }}
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
          visible={menuOpen}
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
          onClose={() => setMenuOpen(false)}
        />
      )}

      {/* Return to progress banner — hidden when TTS is active to avoid conflicting banners */}
      {preJumpLocator && publicationReady && !isTTSActive && (
        <View
          className="absolute left-6 right-6 flex-row items-center border border-surface-tertiary bg-card px-4 py-3"
          style={{ bottom: insets.bottom + spacing[4] }}
        >
          <Touchable className="flex-1" onPress={handleReturnToProgress}>
            <ThemedText type="labelSm" color={asColor(primary)}>
              ← RETURN TO PROGRESS
            </ThemedText>
          </Touchable>
          <Touchable
            className="pl-4"
            onPress={handleDismissReturn}
            hitSlop={8}
          >
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>
              ✕
            </ThemedText>
          </Touchable>
        </View>
      )}

      {/* TTS page-mismatch banner — shown when TTS is paused and user navigates away */}
      {ttsMismatch && isTTSActive && (
        <View
          className="absolute left-6 right-6 flex-row items-center border border-surface-tertiary bg-card px-4 py-3"
          style={{ bottom: insets.bottom + spacing[4] + 60 }}
        >
          <Touchable
            className="flex-1"
            onPress={handleTTSResumeFromPaused}
          >
            <ThemedText type="labelSm" color={asColor(primary)}>
              ← RESUME FROM PAUSED
            </ThemedText>
          </Touchable>
          <Touchable
            className="flex-1"
            onPress={handleTTSContinueFromHere}
          >
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>
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
  top,
}: {
  note: string;
  onNoteChange: (text: string) => void;
  onSave: () => void;
  onSkip: () => void;
  top: number;
}) {
  const [primary, mutedForeground] = useCSSVariable([
    "--color-primary",
    "--color-muted-foreground",
  ]);
  return (
    <View
      className="absolute left-6 right-6 gap-3 border border-surface-tertiary bg-card p-4"
      style={{ top: top + spacing[3] }}
    >
      <ThemedText type="labelSm" color={asColor(mutedForeground)}>
        ADD A NOTE TO THIS BOOKMARK
      </ThemedText>
      <View className="bg-muted px-3 py-2">
        <TextInput
          value={note}
          onChangeText={onNoteChange}
          placeholder="What caught your attention here?"
          placeholderTextColor={asColor(mutedForeground)}
          className="min-h-[40px] text-[14px] text-foreground"
          multiline
          autoFocus
          returnKeyType="done"
          blurOnSubmit
          onSubmitEditing={onSave}
        />
      </View>
      <View className="flex-row justify-end gap-4">
        <Touchable onPress={onSkip} hitSlop={8}>
          <ThemedText type="labelSm" color={asColor(mutedForeground)}>
            SKIP
          </ThemedText>
        </Touchable>
        <Touchable onPress={onSave} hitSlop={8}>
          <ThemedText type="labelSm" color={asColor(primary)}>
            SAVE
          </ThemedText>
        </Touchable>
      </View>
    </View>
  );
}
