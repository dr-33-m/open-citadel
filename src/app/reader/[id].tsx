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

import { useCloudVoiceFailure } from "@/features/reader/hooks/use-cloud-voice-failure";
import { useReadAloudBridge } from "@/features/reader/hooks/use-read-aloud-bridge";
import { readerVoiceId } from "@/services/device-tts/catalogue";
import { HighlightMenu } from "@/components/reader/highlight-menu";
import { ReaderHeader, READER_HEADER_HEIGHT } from "@/components/reader/reader-header";
import { SelectionBar } from "@/components/reader/selection-bar";
import { TocSheet } from "@/components/reader/toc-sheet";
import { TTSControls } from "@/components/reader/tts-controls";
import { ThemedText } from "@/components/themed-text";
import { PlansSheet } from "@/features/billing/components/plans-sheet";
import { CloudVoiceFailureSheet } from "@/features/tts/components/cloud-voice-failure-sheet";
import { TtsSettingsSheet } from "@/features/tts/components/tts-settings-sheet";
import ReanimatedView, { FadeOut } from "react-native-reanimated";
import { easing, motion, slideDownPastEdge, slideUpFromEdge, spacing } from "@/constants/theme";
import { asColor } from "@/utils/colors";
import { useBooksStore } from "@/stores/books";
import { useChatStore } from "@/stores/chat";
import { useReaderStore } from "@/stores/reader";
import { useSettingsStore } from "@/stores/settings";
import { ReaderLoading } from "@/features/reader/components/reader-loading";
import { useThemeMode } from "@/hooks/use-theme";
import { ReadingSkeleton } from "@/features/reader/components/reading-skeleton";
import { useSettledOnce } from "@/navigation/use-settled-once";
import { extractChapterTextToLocator } from "@/services/book-context";
import { sessionExists } from "@/services/chat-sessions";
import { showChatOnSamwellPage } from "@/services/samwell-handoff";
import { suggestTags } from "@/services/tag-suggest";
import {
  startMediaSession,
  stopMediaSession,
} from "@/services/tts-media-session";

// Height of the header content below the status bar. Read from the header
// itself rather than guessed: this number is what the reading area reserves
// for it, and an under-guess is invisible in code and very visible on a page.
const HEADER_CONTENT_HEIGHT = READER_HEADER_HEIGHT;

/** How long the reading placeholder is held after Readium reports the
 * publication — see `readerPainted`. Measured, not guessed. */
const PAINT_GRACE_MS = 450;

// Reserved space above the bottom safe area for the floating TTS controls /
// page indicator, so paginated text never renders underneath them
const FOOTER_CONTROLS_HEIGHT = spacing[16];

const isAndroid = process.env.EXPO_OS === "android";

/** A locator passed as a route param, or null when there is none to read. */
function parseLocatorParam(param: string | undefined): Locator | null {
  if (!param) return null;
  try {
    return JSON.parse(param) as Locator;
  } catch {
    // A link written before the router decoded params for us.
    try {
      return JSON.parse(decodeURIComponent(param)) as Locator;
    } catch {
      return null;
    }
  }
}

export default function ReaderScreen() {
  // The theme the reader is drawn in, which is also when its colours below
  // change: read from the setting it ran a step ahead of them, and the page
  // was restyled twice for one change.
  const { mode: appTheme } = useThemeMode();
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
  // Whichever voice reads, on the phone or in the cloud, answers Readium
  // through this; a cloud voice that cannot go on is held and drawn below.
  const readAloud = useReadAloudBridge(readerRef, id);
  const { onSynthesisRequest, onSynthesisCancel, onUtterance } = readAloud;
  const cloudFailure = useCloudVoiceFailure(readerRef, readAloud);

  const {
    currentBook,
    savedLocator,
    currentLocator,
    progress,
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
    setLastFile,
    closeBook,
  } = useReaderStore();

  const createChatSession = useChatStore((s) => s.createSession);

  // Selectors, not whole-store subscriptions: a bare `useBooksStore()` re-ran
  // this screen on every library sync tick, and a bare `useSettingsStore()` on
  // every unrelated setting write — neither of which the reader displays.
  const updateBookMetadata = useBooksStore((s) => s.updateBookMetadata);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const ttsVoiceLanguage = useSettingsStore((s) => s.ttsVoiceLanguage);
  const ttsRate = useSettingsStore((s) => s.ttsRate);

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
  const [showToc, setShowToc] = useState(false);
  const [showTtsSettings, setShowTtsSettings] = useState(false);
  const [preJumpLocator, setPreJumpLocator] = useState<Locator | null>(null);
  const [publicationReady, setPublicationReady] = useState(false);

  /**
   * Whether Readium has had time to actually draw a page behind the cover.
   *
   * `publicationReady` says the publication is loaded, not that anything has
   * been painted with it — measured on an A33, the first text lands roughly
   * 450ms later. Dropping the cover on that signal, or a frame or two after
   * it, let the skeleton leave before the passage arrived: the blank between
   * them.
   *
   * `onLocationChange` looked like the honest signal and is worse — it reports
   * that Readium knows *where* it is, which happens before it has drawn
   * anything, so it uncovers even earlier.
   *
   * So this is a measured wait rather than an event, which is worth being
   * plain about: there is no "first paint" callback on the view to hang it on.
   * Overshooting is close to free — the cover is a placeholder the reader is
   * already looking at — while undershooting is the flash this exists to
   * remove, so the number leans long. Re-measure if the reader's mount path
   * changes.
   */
  const [readerPainted, setReaderPainted] = useState(false);

  // Reset lives with `setPublicationReady(false)` on book change rather than in
  // here, so this effect only ever schedules — an effect that also writes state
  // synchronously is the cascading-render pattern the compiler warns about.
  useEffect(() => {
    if (!publicationReady) return undefined;
    const timer = setTimeout(() => setReaderPainted(true), PAINT_GRACE_MS);
    return () => clearTimeout(timer);
  }, [publicationReady]);
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
  // Read from the transition's own end (see `useSettledOnce`), which also
  // keeps this screen from re-rendering whenever focus comes back to it.
  const readerMounted = useSettledOnce();

  // Show header on mount
  useEffect(() => {
    showHeader();
  }, []);

  useEffect(() => {
    setPublicationReady(false);
    setReaderPainted(false);
    if (id) openBook(id);
    return () => closeBook();
  }, [id]);

  // Where a link asked to open (a highlight on the timeline, a passage in a
  // chat), when it asked for somewhere rather than the saved position. The
  // router hands the param over decoded; decoding it again threw on any `%`
  // in the passage's stored context ("15% a month"), and the reader quietly
  // opened at the saved position instead.
  const jumpLocator = useMemo(() => parseLocatorParam(locatorParam), [locatorParam]);

  // When opened at a jump, offer a way back to saved progress — but only if
  // the jump is on a different page.
  const didSetJumpRef = useRef(false);
  useEffect(() => {
    if (!locatorParam || !savedLocator || didSetJumpRef.current) return;
    const jumpPage = jumpLocator?.locations?.position;
    const savedPage = savedLocator.locations?.position;
    if (jumpPage !== undefined && savedPage !== undefined && jumpPage === savedPage) return;
    didSetJumpRef.current = true;
    setPreJumpLocator(savedLocator);
  }, [locatorParam, jumpLocator, savedLocator]);

  // Read-aloud belongs to the book: leaving it, by the back button or for a
  // chat, stops it. Back a screen, or down to the hub (a chat opens on the
  // Samwell page). The page stays on screen as it slides away: it used to be
  // unmounted first, against a white flash from the native view that no
  // longer happens, and the reader watched the words vanish and a blank page
  // close.
  const leave = useCallback(
    (to: "back" | "hub") => {
      if (isTTSActive) {
        readerRef.current?.ttsStop();
        stopMediaSession();
      }
      if (to === "hub" && router.canDismiss()) router.dismissTo("/");
      else router.back();
    },
    [isTTSActive, router],
  );

  // A chat about a passage is made here, with its context, and held on the
  // Samwell page like every other chat; the reader closes on the way.
  const openChat = useCallback(
    async (sessionId: string) => {
      await showChatOnSamwellPage(sessionId);
      leave("hub");
    },
    [leave],
  );

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
      // Where the book ends: its positions run in reading order.
      setLastFile(event.positions?.at(-1)?.href ?? null);

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
    [currentBook, setTableOfContents, setLastFile, updateBookMetadata],
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
      await openChat(sessionId);
    },
    [currentBook, chatLoading, addHighlight, updateHighlight, createChatSession, openChat],
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
    // Open the chat already linked, unless it has since been deleted: then a
    // new one is made below, with its context, rather than opened blank.
    if (existingChatSessionId && sessionExists(existingChatSessionId)) {
      setMenuOpen(false);
      await openChat(existingChatSessionId);
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
    await openChat(sessionId);
  }, [currentBook, chatLoading, createChatSession, updateHighlight, openChat]);

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
    // The rest of the paragraph, for a cloud voice to fetch ahead from.
    onUtterance(event.locator.text?.after);

    // No goTo here: the native side (HybridReadiumView.swift's
    // `manager.onUtterance`) turns the page itself now, and waits for that
    // to finish before Kokoro's audio starts. A JS round trip had no way to
    // signal "the page actually turned" back to the native TTS engine, so
    // calling goTo from here could only ever race the audio, not sequence
    // before it. currentLocatorRef still updates from the native
    // onLocationChange event this navigation fires either way.
  }, [onUtterance]);

  const handleTTSToggle = useCallback(() => {
    if (!isTTSActive) {
      setTtsMismatch(false);
      readerRef.current?.ttsStart({
        voice: readerVoiceId(ttsVoice),
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
          voice: readerVoiceId(ttsVoice),
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
          voice: readerVoiceId(ttsVoice),
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

  const initialLocation = useMemo(
    () => jumpLocator ?? savedLocator ?? undefined,
    [jumpLocator, savedLocator],
  );

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

  // The placeholder until the slide has landed, even when the book is in hand
  // sooner (it is read from the database while the screen slides in). The
  // reader's chrome is a large tree, and committing it mid-slide left this
  // screen undrawn for the whole of its entrance: the Library moved aside,
  // nothing arrived, and the reader appeared in place afterwards.
  if (!readerMounted || isLoading || !currentBook || !currentBook.filePath) {
    return <ReaderLoading top={insets.top} />;
  }

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

          Not mounted until the entrance has settled (see the note on
          `readerMounted`), and kept through the exit so the page leaves with
          its words on it. */}
      <View className="flex-1" style={{ marginBottom: footerZoneHeight }}>
        {!readerMounted ? null : (
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
            onTTSSynthesisRequest={onSynthesisRequest}
            onTTSSynthesisCancel={onSynthesisCancel}
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
        {!readerPainted && (
          <ReanimatedView.View
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            className="bg-background"
            exiting={FadeOut.duration(motion.base).easing(easing)}
          >
            <ReadingSkeleton />
          </ReanimatedView.View>
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
          progress={progress ?? undefined}
          isBookmarked={isBookmarked}
          isTTSActive={isTTSActive}
          onBookmarkToggle={handleBookmarkToggle}
          onBack={() => leave("back")}
          onContents={() => {
            showHeader();
            setShowToc(true);
          }}
          onTTSToggle={handleTTSToggle}
          onTTSLongPress={() => setShowTtsSettings(true)}
          onToggle={toggleHeader}
        />
      </Animated.View>

      {/* TTS controls — float at bottom. They come up from the bottom edge
          when read-aloud is switched on and go back down past it when it is
          switched off, as the mini player does (`slideUpFromEdge`); inside
          that, they follow the header as it hides and shows. */}
      {isTTSActive && (
        <ReanimatedView.View
          entering={slideUpFromEdge}
          exiting={slideDownPastEdge}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: ttsControlsZoneHeight }}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              { flex: 1, alignItems: "center", justifyContent: "center" },
              {
                opacity: headerAnim,
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
              working={readAloud.cloud.working}
              onPlayPause={handleTTSPlayPause}
              onSkipPrevious={() => readerRef.current?.ttsSkipPrevious()}
              onSkipNext={() => readerRef.current?.ttsSkipNext()}
            />
          </Animated.View>
        </ReanimatedView.View>
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

      {/* Long-press on the header's read-aloud button: voice/rate settings
          without leaving the book. Same panel Settings uses, so the two
          never disagree about what "the voice" currently is. */}
      <TtsSettingsSheet visible={showTtsSettings} onClose={() => setShowTtsSettings(false)} />
      <CloudVoiceFailureSheet {...cloudFailure.sheet} />
      <PlansSheet nested {...cloudFailure.plans} />

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
