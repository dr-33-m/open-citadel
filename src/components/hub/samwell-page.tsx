import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, MessageSquare, Search, Settings, Sparkles } from 'lucide-react-native';
import React from 'react';
import {
  Keyboard,
  ScrollView,
  View,
  type ViewStyle,
} from 'react-native';
import { useCSSVariable } from 'uniwind';
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  CompassChatMessage,
  CompassMorningAnalysis,
  CompassNightAnalysis,
  CompassSetupProposal,
} from 'samwell-shared';

import { ChatBubble } from '@/components/chat/chat-bubble';
import { ModelStatusBar } from '@/components/chat/model-status-bar';
import { ThinkingSection } from '@/components/chat/thinking-section';
import { isVisibleChatMessage } from '@/services/chat-transcript';
import { formatCompassDate } from '@/components/compass/format';
import { MorningDraftCard, NightDraftCard, SetupDraftCard } from '@/components/compass/draft-cards';
import { ProgressSheet } from '@/components/compass/progress-sheet';
import { SamwellCompassTimeline } from '@/components/samwell/samwell-compass-timeline';
import { SamwellControlCenter } from '@/components/samwell/samwell-control-center';
import { ThemedText } from '@/components/themed-text';
import { CalendarPicker } from '@/components/timeline/calendar-picker';
import { BookPickerSheet } from '@/features/chat/components/book-picker-sheet';
import { ChatHistorySheet } from '@/features/chat/components/chat-history-sheet';
import { GoldButton } from '@/components/ui/gold-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { Touchable } from '@/components/ui/touchable';
import { easing, iconSize, motion, spacing, MaxContentWidth } from '@/constants/theme';
import { cn } from '@/lib/cn';
import { currentCompassDay } from '@/services/compass-day';
import { activeCheckin, addDaysYmd } from '@/services/compass-math';
import { useAfterFirstPaint } from '@/navigation/use-after-first-paint';
import { DeferredBody } from '@/components/navigation/deferred-body';
import { Reveal } from '@/components/navigation/reveal';
import { useSamwellSessionStore } from '@/stores/samwell-session';
import { HUB, useHubStore } from '@/stores/hub';
import { useChatStore, type ChatSession } from '@/stores/chat';
import { useCompassStore } from '@/stores/compass';
import { useAllBooks, useBooksStore } from '@/stores/books';
import { useModelStore } from '@/stores/model';
import { useSettingsStore } from '@/stores/settings';
import { asColor } from '@/utils/colors';

// The content column: centred and capped on wide screens, pixel-identical on
// phones (the cap never bites below 800). Applied to the transcript
// scrollviews and the floating control-center stack so chat stays a column
// on tablets; the chat bubbles' own `max-w-[82%]` then resolves against it.
const contentColumn: ViewStyle = {
  maxWidth: MaxContentWidth,
  width: '100%',
  alignSelf: 'center',
};


const SETUP_OPENER =
  'Tell me what you want to achieve. It does not have to be about building something; a skill, a habit, a change, anything. We will sharpen it together.';
const MORNING_OPENER =
  'Tell me the plan for today. Say it however it comes; we will shape it together before you log it.';
const NIGHT_OPENER =
  'How did today actually run? Tell it straight, including anything that pulled you off course.';

type CompassFlow = 'setup' | 'morning' | 'night';

export function SamwellPage() {
  // Library and Timeline are peer pages of this one, reached by moving the
  // pager rather than by navigating.
  const goTo = useHubStore((s) => s.goTo);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Literal colours for consumers a className can't reach: lucide icon props
  // and ThemedText's `color` prop.
  const [primary, primaryForeground, mutedForeground, destructive, foreground] = useCSSVariable([
    '--color-primary',
    '--color-primary-foreground',
    '--color-muted-foreground',
    '--color-destructive',
    '--color-foreground',
  ]);
  /** Paid once by the floating bottom stack, and covered by the keyboard when
   * one is up — so the reserve below only ever adds what sits above it. */
  const bottomInset = Math.max(insets.bottom, spacing[3]);
  /** Breathing room between the input card and the top of the keyboard. */
  const KEYBOARD_GAP = spacing[3];

  // Field-by-field selectors rather than one whole-store subscription: this
  // screen is the app's largest render, and a single unrelated field change
  // (model download progress, a settings flip) used to re-run all of it.
  const samwellMode = useSettingsStore((s) => s.samwellMode);
  const cloudBaseUrl = useSettingsStore((s) => s.cloudBaseUrl);
  const compassMorningTime = useSettingsStore((s) => s.compassMorningTime);
  const compassNightTime = useSettingsStore((s) => s.compassNightTime);
  const cloudReady = samwellMode === 'cloud' && cloudBaseUrl.length > 0;
  const notConfigured = cloudBaseUrl.length === 0;

  const sessions = useChatStore((s) => s.sessions);
  const activeSession = useChatStore((s) => s.activeSession);
  const messages = useChatStore((s) => s.messages);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const isThinking = useChatStore((s) => s.isThinking);
  const isToolCalling = useChatStore((s) => s.isToolCalling);
  const toolCallStatus = useChatStore((s) => s.toolCallStatus);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const thinkingContent = useChatStore((s) => s.thinkingContent);
  const deviceLimit = useChatStore((s) => s.deviceLimit);
  const loadSessions = useChatStore((s) => s.loadSessions);
  const createSession = useChatStore((s) => s.createSession);
  const openSession = useChatStore((s) => s.openSession);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopGeneration = useChatStore((s) => s.stopGeneration);
  const clearDeviceLimit = useChatStore((s) => s.clearDeviceLimit);
  const deleteSession = useChatStore((s) => s.deleteSession);

  // Same "is Samwell set up, is he awake" checks `chat/[id].tsx` used to do
  // — regressed when that per-session screen stopped being the only place
  // chat happened. Ported as-is rather than re-derived.
  const isLoaded = useModelStore((s) => s.isLoaded);
  const isLoading = useModelStore((s) => s.isLoading);
  const loadError = useModelStore((s) => s.loadError);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const models = useModelStore((s) => s.models);
  const modelsHydrated = useModelStore((s) => s.modelsHydrated);
  const initContext = useModelStore((s) => s.initContext);
  const activeModel = models.find((m) => m.id === activeModelId);
  const chatModelReady = samwellMode === 'cloud' ? cloudBaseUrl.length > 0 : isLoaded;
  const chatModelDownloaded =
    samwellMode === 'cloud' ? true : modelsHydrated ? (activeModel?.isDownloaded ?? false) : true;

  /** First action reads as the recommended one; the rest are quieter alternates. */
  const renderStatusActions = (actions?: { label: string; onPress: () => void }[]) => {
    if (!actions || actions.length === 0) return null;
    return (
      <View className="mt-1 flex-row flex-wrap justify-center gap-2">
        {actions.map((action, i) => (
          <Touchable
            key={action.label}
            onPress={action.onPress}
            className={cn('border px-4 py-2', i === 0 ? 'border-primary bg-primary' : 'border-border')}
          >
            <ThemedText type="labelSm" color={i === 0 ? asColor(primaryForeground) : undefined}>
              {action.label}
            </ThemedText>
          </Touchable>
        ))}
      </View>
    );
  };

  const switchToCloud = async () => {
    await useSettingsStore.getState().setSamwellMode('cloud');
    clearDeviceLimit();
  };

  const samwellStatus: {
    message: string;
    actions?: { label: string; onPress: () => void }[];
    isError?: boolean;
    isLoading?: boolean;
  } | null =
    // A conversation Samwell can no longer hold is not a dead end: he can
    // carry on in the cloud, or start fresh here. Both are offered rather
    // than leaving the reader staring at a message with nowhere to go.
    // Both limits are on-device conditions. Left ungated they would keep
    // showing after a switch to Cloud, where neither applies.
    samwellMode === 'offline' && deviceLimit === 'context'
      ? {
          message: 'This chat has grown too long for Samwell to hold on your device.',
          actions: [
            { label: 'SWITCH TO CLOUD', onPress: switchToCloud },
            {
              label: 'START NEW CHAT',
              onPress: () => {
                clearDeviceLimit();
                void handleNewChat();
              },
            },
          ],
        }
      : samwellMode === 'offline' && deviceLimit === 'memory'
        ? {
            message: 'Your device is low on memory, so Samwell had to stop here.',
            actions: [{ label: 'SWITCH TO CLOUD', onPress: switchToCloud }],
          }
        : samwellMode === 'cloud' && !cloudBaseUrl
      ? { message: 'Grand Maester Samwell is not set up in this build yet.' }
      : samwellMode === 'cloud'
        ? null
        : !chatModelDownloaded
          ? {
              message: 'Samwell needs a model to run. Set one up in Settings.',
              actions: [{ label: 'SET UP SAMWELL', onPress: () => router.push('/settings') }],
            }
          : loadError
            ? { message: loadError, actions: [{ label: 'RETRY', onPress: initContext }], isError: true }
            : isLoading
              ? { message: 'Waking Samwell up…', isLoading: true }
              : !chatModelReady
                ? {
                    message: 'Samwell is offline. Wake him up to chat.',
                    actions: [{ label: 'WAKE UP', onPress: initContext }],
                  }
                : null;

  const goal = useCompassStore((s) => s.goal);
  const milestone = useCompassStore((s) => s.milestone);
  const telemetry = useCompassStore((s) => s.telemetry);
  const submitting = useCompassStore((s) => s.submitting);
  const error = useCompassStore((s) => s.error);
  const loadCompass = useCompassStore((s) => s.loadCompass);
  const sendSetupTurn = useCompassStore((s) => s.sendSetupTurn);
  const sendMorningTurn = useCompassStore((s) => s.sendMorningTurn);
  const sendNightTurn = useCompassStore((s) => s.sendNightTurn);
  const finalizeSetup = useCompassStore((s) => s.finalizeSetup);
  const finalizeMorning = useCompassStore((s) => s.finalizeMorning);
  const finalizeNight = useCompassStore((s) => s.finalizeNight);
  const updateTargetDates = useCompassStore((s) => s.updateTargetDates);
  const archiveGoal = useCompassStore((s) => s.archiveGoal);

  const allBooks = useAllBooks();

  // Held in a store rather than in this component: the screen is pushed now,
  // so leaving it unmounts it, and a half-finished check-in is a conversation
  // the user has already had once. See `stores/samwell-session`.
  const mode = useSamwellSessionStore((s) => s.mode);
  const compassOpen = useSamwellSessionStore((s) => s.compassOpen);
  const compassPeek = useSamwellSessionStore((s) => s.compassPeek);
  const text = useSamwellSessionStore((s) => s.draft);
  const pendingBook = useSamwellSessionStore((s) => s.pendingBook);
  const compassMessages = useSamwellSessionStore((s) => s.compassMessages);
  const compassDraft = useSamwellSessionStore((s) => s.compassDraft);
  const committingProposal = useSamwellSessionStore((s) => s.committingProposal);
  const milestoneDate = useSamwellSessionStore((s) => s.milestoneDate);
  const goalDate = useSamwellSessionStore((s) => s.goalDate);
  const setSession = useSamwellSessionStore((s) => s.set);
  const resetCompass = useSamwellSessionStore((s) => s.resetCompass);
  const setMode = React.useCallback(
    (next: 'chat' | 'compass') => setSession({ mode: next }),
    [setSession],
  );
  const setText = React.useCallback((next: string) => setSession({ draft: next }), [setSession]);
  // For a brand-new session, `openSession` primes the engine with the system
  // prompt BEFORE `sendMessage` ever adds the user's message to the store —
  // on a slow device that priming call can take a real moment, during which
  // the message the user just sent has nowhere to render yet. This is a
  // purely local stand-in shown only until the real message lands.
  const [pendingUserMessage, setPendingUserMessage] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<ChatSession | null>(null);
  // The input card and nav float over the transcript so messages stay visible
  // through the gaps around them. Their combined height is measured rather
  // than assumed, since the card grows with the text field and the nav
  // collapses when dragged away.
  const [floatingBottomHeight, setFloatingBottomHeight] = React.useState(0);

  // Leaving this screen is where a bookless chat gets its last chance to pick
  // up a better title from its full transcript — the same thing `chat/[id]`
  // does on its own blur.
  useFocusEffect(
    React.useCallback(() => {
      return () => {
        void useChatStore.getState().refineSessionTitleOnExit();
      };
    }, []),
  );

  // The two chat pickers are sheets over this page rather than routes: they
  // are a choice made about the chat in front of you, not a place you go, and
  // a sheet keeps the transcript visible behind it.
  const [showBookPicker, setShowBookPicker] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);

  // No KeyboardAvoidingView: this screen is edge-to-edge, so the window never
  // resizes for the keyboard and a KAV can only fight the absolute layout —
  // `behavior="height"` double-counted and left the card stranded. Instead one
  // spacer below the card reserves exactly the part of the keyboard that sits
  // above the safe-area inset the floating stack already pays for.
  const keyboard = useAnimatedKeyboard();
  const keyboardSpacerStyle = useAnimatedStyle(
    () => ({
      // A gap, because landing the card exactly on the keyboard's edge clips
      // its border and its `elevation.card` shadow, which reads as the
      // keyboard cutting into it.
      height:
        keyboard.height.value > 0
          ? Math.max(0, keyboard.height.value + KEYBOARD_GAP - bottomInset)
          : 0,
    }),
    [bottomInset, KEYBOARD_GAP],
  );

  const [calendarFor, setCalendarFor] = React.useState<'milestone' | 'goal' | null>(null);
  const [finalizing, setFinalizing] = React.useState(false);

  const [showProgress, setShowProgress] = React.useState(false);
  const [editingDate, setEditingDate] = React.useState<'milestone' | 'goal' | null>(null);

  const chatScrollRef = React.useRef<ScrollView>(null);
  const compassScrollRef = React.useRef<ScrollView>(null);

  // Kept off the screen's first render so the push can start immediately;
  // see the hook. One frame, not the whole transition.
  const painted = useAfterFirstPaint();

  React.useEffect(() => {
    // Session + book loads are DB reads and stay off the transition path —
    // the transcript region they feed is deferred anyway.
    if (!painted) return;
    loadSessions();
    // The books store is otherwise only filled by the Library tab, so a
    // session opened before visiting it could not resolve its book's cover.
    if (useBooksStore.getState().books.length === 0) {
      void useBooksStore.getState().loadBooks();
    }
  }, [painted, loadSessions]);

  React.useEffect(() => {
    if (painted && cloudReady) loadCompass();
  }, [painted, cloudReady, loadCompass]);

  const compassFlow: CompassFlow = !goal
    ? 'setup'
    : activeCheckin(new Date(), compassMorningTime, compassNightTime);

  const compassOpener =
    compassFlow === 'setup' ? SETUP_OPENER : compassFlow === 'morning' ? MORNING_OPENER : NIGHT_OPENER;

  const displayedBookTitle = activeSession?.bookTitle ?? pendingBook?.title ?? null;
  const displayedBookCover = activeSession?.bookId
    ? allBooks.find((b) => b.id === activeSession.bookId)?.coverUrl ?? null
    : pendingBook
      ? allBooks.find((b) => b.id === pendingBook.id)?.coverUrl ?? null
      : null;
  // Once a session exists, its book is fixed context — the button is only
  // worth showing then if there's a book to display; a bookless session's
  // button would just be inert with nothing to say.
  const showBookButton = !activeSession || activeSession.bookId != null;

  const visibleChatMessages = messages.filter(isVisibleChatMessage);

  async function handleSend() {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setText('');

    if (mode === 'chat') {
      setPendingUserMessage(trimmed);
      try {
        if (!activeSession) {
          const sessionId = await createSession({
            bookId: pendingBook?.id,
            title: pendingBook?.title ?? 'New chat',
          });
          await openSession(sessionId);
        }
        await sendMessage(trimmed);
      } finally {
        setPendingUserMessage(null);
      }
      return;
    }

    const next: CompassChatMessage[] = [...compassMessages, { role: 'user', content: trimmed }];
    // Sending opens the conversation over the Compass timeline; the calendar
    // button in the control center peeks back at it without closing this.
    setSession({ compassMessages: next, compassDraft: null, compassOpen: true });
    await runCompassTurn(next);
  }

  async function runCompassTurn(msgs: CompassChatMessage[]) {
    if (compassFlow === 'setup') {
      const turn = await sendSetupTurn(msgs);
      if (turn) {
        setSession({
          compassMessages: [...msgs, { role: 'assistant', content: turn.reply }],
          compassDraft: turn.draft,
        });
      }
    } else if (compassFlow === 'morning') {
      const turn = await sendMorningTurn(msgs);
      if (turn) {
        setSession({
          compassMessages: [...msgs, { role: 'assistant', content: turn.reply }],
          compassDraft: turn.draft,
        });
      }
    } else {
      const turn = await sendNightTurn(msgs);
      if (turn) {
        setSession({
          compassMessages: [...msgs, { role: 'assistant', content: turn.reply }],
          compassDraft: turn.draft,
        });
      }
    }
  }

  function handleApproveDraft() {
    if (!compassDraft) return;
    if (compassFlow === 'setup') {
      const proposal = compassDraft as CompassSetupProposal;
      const today = currentCompassDay();
      setSession({
        committingProposal: proposal,
        milestoneDate: addDaysYmd(today, proposal.milestoneDurationDays),
        ...(!goal && proposal.goalDurationDays
          ? { goalDate: addDaysYmd(today, proposal.goalDurationDays) }
          : {}),
      });
    } else {
      void handleFinalizeCheckin();
    }
  }

  async function handleFinalizeCheckin() {
    const transcript = compassMessages
      .map((m) => `${m.role === 'user' ? 'Me' : 'Samwell'}: ${m.content}`)
      .join('\n\n');
    setFinalizing(true);
    let ok = false;
    if (compassFlow === 'morning' && compassDraft) {
      ok = await finalizeMorning({ analysis: compassDraft as CompassMorningAnalysis, transcript });
    } else if (compassFlow === 'night' && compassDraft) {
      ok = await finalizeNight({ analysis: compassDraft as CompassNightAnalysis, transcript });
    }
    setFinalizing(false);
    if (ok) resetCompass();
  }

  async function handleConfirmSetup() {
    if (!committingProposal || !milestoneDate) return;
    if (!goal && !goalDate) {
      setCalendarFor('goal');
      return;
    }
    setFinalizing(true);
    const ok = await finalizeSetup({
      proposal: committingProposal,
      milestoneTargetDate: milestoneDate,
      goalTargetDate: goalDate,
    });
    setFinalizing(false);
    if (ok) resetCompass();
  }



  function handleClearPendingBook() {
    setSession({ pendingBook: null });
  }

  // A focused text input's keyboard dismissing at the same time a bottom
  // sheet is trying to present is a common cause of the sheet silently
  // failing to reach its snap point — settle the keyboard first.
  function handleOpenBookPicker() {
    Keyboard.dismiss();
    setShowBookPicker(true);
  }

  function handleOpenHistory() {
    Keyboard.dismiss();
    setShowHistory(true);
  }

  // Switching sessions does its own slow engine work (re-titling the
  // outgoing session, re-priming the incoming one's book context) — on a
  // slow device that can take a real while, and nothing previously stopped
  // a second tap (another row, "New chat", the book picker) from firing a
  // second overlapping call into the engine mid-switch. That's the same
  // concurrent-access crash class as before, just re-entered from a new
  // angle. `switching` is both the re-entrancy guard and what the history
  // sheet shows a loading state against, so switching is visibly happening
  // rather than the sheet just looking stuck.
  const [switching, setSwitching] = React.useState<'new' | string | null>(null);

  async function handleSelectSession(id: string) {
    if (switching) return;
    setSwitching(id);
    try {
      if (isGenerating) stopGeneration();
      // The session we're about to leave — not the one being opened — is
      // what needs a last chance to pick up a better title from its full
      // transcript.
      await useChatStore.getState().refineSessionTitleOnExit();
      await openSession(id);
      setSession({ pendingBook: null, mode: 'chat' });
    } finally {
      setSwitching(null);
    }
  }

  async function handleNewChat() {
    if (switching) return;
    setSwitching('new');
    try {
      if (isGenerating) stopGeneration();
      await useChatStore.getState().refineSessionTitleOnExit();
      useChatStore.setState({ activeSession: null, messages: [] });
      setSession({ pendingBook: null, mode: 'chat' });
    } finally {
      setSwitching(null);
    }
  }

  // Two different things: `isGenerating` alone drives the "thinking"
  // indicator in an existing transcript (it must never show that just
  // because the model isn't ready — there is nothing to wait for then).
  // `chatInputBusy` additionally covers "not ready" — `isLoading` is
  // redundant with `!chatModelReady` today (isLoaded only ever flips true
  // after loading fully succeeds) but kept explicit so input-disabling
  // can't silently drift out of sync with load state in a future refactor.
  const chatBusy = isGenerating;
  const chatInputBusy = isGenerating || !chatModelReady || isLoading;
  const compassBusy = submitting === compassFlow || finalizing;

  // `isGenerating` alone isn't "waiting for a reply" — it stays true after
  // the reply has already landed while the engine does follow-up work
  // (auto-titling a fresh bookless chat also runs on it, see chat-title.ts,
  // which is why that flag can't just flip false the moment the reply
  // arrives without reopening the same concurrent-engine-access risk we
  // fixed for session switching). Once the last message is Samwell's own,
  // there's nothing left to wait for — showing "thinking" past that point
  // reads as stuck rather than busy.
  const lastVisibleRole = visibleChatMessages[visibleChatMessages.length - 1]?.role;
  const stillWaitingForReply = chatBusy && lastVisibleRole !== 'assistant';

  // Tapping a referenced highlight opens it at its exact place in the reader;
  // a thought has no passage to open, so it goes to the timeline that holds
  // it. Both were wired in the old per-session chat screen and were lost when
  // the transcript moved here.
  const handleNavigateToHighlight = React.useCallback(
    (bookId: string, locator: string) => {
      router.push({ pathname: '/reader/[id]', params: { id: bookId, locator } });
    },
    [router],
  );

  const handleNavigateToTimeline = React.useCallback(() => {
    goTo(HUB.timeline);
  }, [goTo]);

  // A recommended book opens where the reader would go next: the reader
  // itself, which resumes at their saved position for a book already started.
  const handleNavigateToBook = React.useCallback(
    (bookId: string) => {
      router.push({ pathname: '/reader/[id]', params: { id: bookId } });
    },
    [router],
  );

  /** Bottom padding that keeps content clear of the floating card and nav. */
  const floatingClearance = React.useMemo(
    () => ({ paddingBottom: floatingBottomHeight + spacing[3] }),
    [floatingBottomHeight],
  );

  // Same pulse the old per-session chat screen used for its tool-call and
  // thinking/processing indicators — ported onto Reanimated (already used
  // throughout this screen for the nav) rather than pulling in the classic
  // Animated API just for this one effect.
  const pulseOpacity = useSharedValue(0.4);
  React.useEffect(() => {
    if (stillWaitingForReply && streamingContent.length === 0) {
      pulseOpacity.value = withRepeat(withTiming(1, { duration: 800, easing }), -1, true);
    } else {
      pulseOpacity.value = withTiming(0.4, { duration: motion.fast, easing });
    }
  }, [stillWaitingForReply, streamingContent.length]);
  const pulseAnimatedStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  // Same three states the old screen's `listFooter` handled: a labeled
  // tool-call indicator (what search/tag/delete action is actually
  // running — this was dropped entirely when this screen was built, along
  // with the thinking/processing pulse and the post-reply expandable
  // reasoning trace), a streaming reply (rendered as its own bubble above,
  // not here), or the generic thinking/processing pulse while waiting for
  // the first token.
  let chatFooter: React.ReactNode = null;
  if (!isGenerating && thinkingContent) {
    chatFooter = <ThinkingSection content={thinkingContent} />;
  } else if (stillWaitingForReply && isToolCalling) {
    // Tool-call / thinking-processing pill — left-aligned like an
    // assistant bubble, matching the old per-session chat screen.
    chatFooter = (
      <View className="mb-1 flex-row justify-start px-4">
        <View className="flex-row items-center gap-2 bg-muted px-3 py-2">
          <Animated.View style={pulseAnimatedStyle}>
            <Search size={14} color={asColor(primary)} />
          </Animated.View>
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            {toolCallStatus ?? 'Searching…'}
          </ThemedText>
        </View>
      </View>
    );
  } else if (stillWaitingForReply && streamingContent.length === 0) {
    chatFooter = (
      <View className="mb-1 flex-row justify-start px-4">
        <View className="flex-row items-center gap-2 bg-muted px-3 py-2">
          <Animated.View style={pulseAnimatedStyle}>
            <Sparkles size={14} color={asColor(primary)} />
          </Animated.View>
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            {isThinking ? 'Thinking…' : 'Processing…'}
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <View style={{ paddingTop: insets.top }}>
        {/* One bar, three titles. Back always returns to the Library — this
            screen is a spoke off it, and switching between chats is the
            history sheet's job, not the back button's. Settings sits on the
            right because that is the direction it belongs in relative to
            here; it opens as a drawer from below.
            A chat's own title takes over the centre once there is one, with
            the model's state and the book it is grounded in on the line
            underneath, so the header says what you are in rather than which
            screen you are on. */}
        <ScreenHeader
          title={
            mode === 'compass'
              ? 'Compass'
              : (activeSession?.title ?? pendingBook?.title ?? 'Samwell')
          }
          leftIcon={<ArrowLeft size={iconSize.default} color={asColor(foreground)} />}
          leftLabel="Library"
          onLeftPress={() => goTo(HUB.library)}
          rightIcon={<Settings size={iconSize.default} color={asColor(foreground)} />}
          rightLabel="Settings"
          onRightPress={() => router.push('/settings')}
        >
          {mode === 'chat' && (activeSession || pendingBook || pendingUserMessage) ? (
            <View className="w-full flex-row flex-wrap items-center justify-center gap-2">
              <ModelStatusBar onPress={initContext} />
              {(activeSession?.bookTitle ?? pendingBook?.title) && (
                <Touchable
                  className="max-w-[55%] bg-muted px-2 py-[2px]"
                  onPress={() => {
                    if (activeSession?.bookId && activeSession.contextLocator) {
                      router.push({
                        pathname: '/reader/[id]',
                        params: { id: activeSession.bookId, locator: activeSession.contextLocator },
                      });
                    }
                  }}
                >
                  <ThemedText type="labelSm" color={asColor(primary)} numberOfLines={1}>
                    {activeSession?.bookTitle ?? pendingBook?.title}
                  </ThemedText>
                </Touchable>
              )}
            </View>
          ) : null}
        </ScreenHeader>
      </View>

      {/* Everything below the header is the heavy body: the transcript, the
          floating input stack and the sheets. It mounts the frame after the
          shell paints rather than in the same pass, so the push starts on the
          next frame instead of after a full mount (see `useAfterFirstPaint`
          and `DeferredBody`); the skeleton below covers those one or two
          frames, and the body crossfades over it. The transition itself runs
          on the UI thread, so the mount lands during the slide rather than
          holding it up. */}
      <DeferredBody>
        <>
      {/* The transcript region and the floating card below are the screen's
          two beats: the content it came for, then the thing to type into. */}
      <Reveal index={0} className="flex-1">
        {mode === 'chat' ? (
          visibleChatMessages.length === 0 && !streamingContent && !pendingUserMessage ? (
            <EmptyState size="sm" style={floatingClearance}>
              <EmptyState.Header>
                <EmptyState.Media>
                  {samwellStatus?.isLoading ? (
                    <Spinner size="md" />
                  ) : (
                    <MessageSquare
                      size={40}
                      color={samwellStatus?.isError ? asColor(destructive) : asColor(mutedForeground)}
                      style={{ opacity: samwellStatus?.isError ? 1 : 0.3 }}
                    />
                  )}
                </EmptyState.Media>
                <EmptyState.Description className={cn(samwellStatus?.isError && 'text-destructive')}>
                  {samwellStatus?.message ?? 'Ask Samwell about your books'}
                </EmptyState.Description>
              </EmptyState.Header>
              {samwellStatus?.actions ? (
                <EmptyState.Content>
                  {renderStatusActions(samwellStatus.actions)}
                </EmptyState.Content>
              ) : null}
            </EmptyState>
          ) : (
            <>
              {samwellStatus && (
                // Persistent status banner above an already-loaded transcript — same
                // idea as the centred idle-placeholder message, just for the case
                // where there's a conversation to show underneath it too. Wrapped in
                // the content column so it aligns with the capped transcript.
                <View style={contentColumn}>
                  <View className="m-3 gap-2 border border-surface-tertiary bg-muted p-3">
                    <View className="flex-row items-center gap-2">
                      {samwellStatus.isLoading && <Spinner size="sm" />}
                      <ThemedText
                        type="bodySm"
                        color={samwellStatus.isError ? asColor(destructive) : asColor(mutedForeground)}
                        className="flex-1"
                      >
                        {samwellStatus.message}
                      </ThemedText>
                    </View>
                    {renderStatusActions(samwellStatus.actions)}
                  </View>
                </View>
              )}
              <ScrollView
                ref={chatScrollRef}
                className="flex-1"
                style={contentColumn}
                contentContainerClassName="px-4 py-3 gap-1"
                contentContainerStyle={[floatingClearance]}
                onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
              >
                {visibleChatMessages.length === 0 && pendingUserMessage && (
                  // This transcript is a plain (non-recycled) ScrollView, so
                  // bubbles may play their entrance — unlike chat/[id].tsx's
                  // recycled FlashList.
                  <ChatBubble role="user" content={pendingUserMessage} animateEntry />
                )}
                {visibleChatMessages.map((m) => (
                  <ChatBubble
                    key={m.id}
                    role={m.role as 'user' | 'assistant'}
                    content={m.content}
                    animateEntry
                    onNavigateToHighlight={handleNavigateToHighlight}
                    onNavigateToTimeline={handleNavigateToTimeline}
                    onNavigateToBook={handleNavigateToBook}
                  />
                ))}
                {streamingContent.length > 0 && (
                  <ChatBubble
                    role="assistant"
                    content={streamingContent}
                    streaming
                    animateEntry
                    onNavigateToHighlight={handleNavigateToHighlight}
                    onNavigateToTimeline={handleNavigateToTimeline}
                    onNavigateToBook={handleNavigateToBook}
                  />
                )}
                {pendingUserMessage && visibleChatMessages.length === 0 ? (
                  <View className="mb-1 flex-row justify-start px-4">
                    <View className="flex-row items-center gap-2 bg-muted px-3 py-2">
                      <Spinner size="sm" />
                      <ThemedText type="bodySm" color={asColor(mutedForeground)}>
                        Processing…
                      </ThemedText>
                    </View>
                  </View>
                ) : (
                  chatFooter
                )}
              </ScrollView>
            </>
          )
        ) : !compassOpen || compassPeek ? (
          <SamwellCompassTimeline
            cloudReady={cloudReady}
            notConfigured={notConfigured}
            onOpenSettings={() => router.push('/settings')}
            goal={goal}
          />
        ) : compassMessages.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-2 px-4" style={floatingClearance}>
            <ThemedText type="bodySm" color={asColor(mutedForeground)}>
              Start chatting
            </ThemedText>
          </View>
        ) : (
          <ScrollView
            ref={compassScrollRef}
            className="flex-1"
            style={contentColumn}
            contentContainerClassName="px-4 py-3 gap-1"
            contentContainerStyle={[floatingClearance]}
            onContentSizeChange={() => compassScrollRef.current?.scrollToEnd({ animated: true })}
          >
            <ChatBubble role="assistant" content={compassOpener} animateEntry />
            {compassMessages.map((m, i) => (
              <ChatBubble key={i} role={m.role} content={m.content} animateEntry />
            ))}

            {submitting === compassFlow && (
              <View className="flex-row items-center gap-3 px-4 py-3">
                <Spinner size="sm" />
                <ThemedText type="labelMd" color={asColor(mutedForeground)}>
                  GRAND MAESTER SAMWELL IS THINKING…
                </ThemedText>
              </View>
            )}

            {compassDraft && !committingProposal && (
              <View className="px-1 py-2">
                {compassFlow === 'setup' ? (
                  <SetupDraftCard
                    proposal={compassDraft as CompassSetupProposal}
                    onApprove={handleApproveDraft}
                    onRefine={() => {}}
                  />
                ) : compassFlow === 'morning' ? (
                  <MorningDraftCard
                    analysis={compassDraft as CompassMorningAnalysis}
                    onApprove={handleApproveDraft}
                    onRefine={() => {}}
                    disabled={finalizing}
                  />
                ) : (
                  <NightDraftCard
                    analysis={compassDraft as CompassNightAnalysis}
                    onApprove={handleApproveDraft}
                    onRefine={() => {}}
                    disabled={finalizing}
                  />
                )}
              </View>
            )}

            {committingProposal && (
              <View className="px-1 py-2">
                <View className="border-l-2 border-l-primary gap-3 bg-card p-4">
                  <ThemedText type="labelSm" color={asColor(primary)}>
                    COMMIT
                  </ThemedText>
                  <ThemedText type="headlineSm">{committingProposal.goalTitle}</ThemedText>
                  <Touchable className="border border-border bg-muted p-3" onPress={() => setCalendarFor('milestone')}>
                    <ThemedText type="bodyMd">
                      {milestoneDate ? formatCompassDate(milestoneDate) : 'Pick milestone date'}
                    </ThemedText>
                  </Touchable>
                  {!goal && (
                    <Touchable className="border border-border bg-muted p-3" onPress={() => setCalendarFor('goal')}>
                      <ThemedText type="bodyMd">
                        {goalDate ? formatCompassDate(goalDate) : 'Pick goal target date'}
                      </ThemedText>
                    </Touchable>
                  )}
                  <GoldButton
                    label={finalizing ? 'SETTING UP…' : 'CONFIRM GOAL'}
                    onPress={finalizing ? undefined : handleConfirmSetup}
                  />
                </View>
              </View>
            )}
          </ScrollView>
        )}
      </Reveal>

      {/* Floats over the transcript rather than sitting below it, so messages
          run the full height and scroll behind the card. Scrollable children
          pay for the overlap with `floatingClearance`. */}
      <Reveal
        index={1}
        className="absolute bottom-0 left-0 right-0"
        style={{ paddingBottom: Math.max(insets.bottom, spacing[3]) }}
        onLayout={(e) => setFloatingBottomHeight(e.nativeEvent.layout.height)}
      >
        {/* Inside the floating stack rather than above it — left in normal
            flow it would have ended up hidden behind the card. Both the
            error line and the control center are capped to the content
            column so the card doesn't stretch edge-to-edge on wide
            screens. */}
        {error != null && (
          <ThemedText
            type="bodySm"
            color={asColor(destructive)}
            className="px-4 pb-2"
            // Inline rather than `contentColumn`: ThemedText takes a
            // TextStyle, and the shared const is typed as a ViewStyle.
            style={{ maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' }}
          >
            {error}
          </ThemedText>
        )}

        <View className="px-4 pt-2" style={contentColumn}>
          <SamwellControlCenter
            mode={mode}
            compassOpen={compassOpen}
            compassPeek={compassPeek}
            onSelectMode={setMode}
            lockMode={isGenerating || switching !== null || compassBusy}
            onTogglePeek={() => setSession({ compassPeek: !compassPeek })}
            text={text}
            onChangeText={setText}
            onSend={handleSend}
            busy={mode === 'chat' ? chatInputBusy : compassBusy}
            showStop={mode === 'chat' && isGenerating}
            onStop={stopGeneration}
            placeholder={
              mode === 'chat' ? 'Message Samwell…' : !goal ? 'I want to…' : compassFlow === 'morning' ? 'Today I want to…' : 'Today I actually…'
            }
            showBookButton={showBookButton}
            pendingBookTitle={displayedBookTitle}
            pendingBookCover={displayedBookCover}
            onOpenBookPicker={activeSession || isGenerating || switching ? undefined : handleOpenBookPicker}
            onClearBook={activeSession || !pendingBook || isGenerating || switching ? undefined : handleClearPendingBook}
            // Disabled while generating or switching — selecting a different
            // (or the same) session while either is happening is what was
            // racing the engine (see handleSelectSession).
            onOpenHistory={isGenerating || switching ? undefined : handleOpenHistory}
            hasGoal={goal != null}
            onOpenGoal={() => setShowProgress(true)}
            onOpenMilestone={() => setShowProgress(true)}
          />
        </View>

        <Animated.View style={[{ overflow: 'hidden' }, keyboardSpacerStyle]} />
      </Reveal>

      <BookPickerSheet
        visible={showBookPicker}
        onSelect={(bookId, bookTitle) => {
          setSession({ pendingBook: { id: bookId, title: bookTitle } });
          setShowBookPicker(false);
        }}
        onClose={() => setShowBookPicker(false)}
      />

      <ChatHistorySheet
        visible={showHistory}
        sessions={sessions}
        switching={switching}
        onSelect={(id) => {
          setShowHistory(false);
          void handleSelectSession(id);
        }}
        onNewChat={() => {
          setShowHistory(false);
          void handleNewChat();
        }}
        // The confirm is a dialog over the page, so the sheet steps aside
        // first — two overlays stacked on each other is how you end up
        // dismissing the wrong one.
        onRequestDelete={(session) => {
          setShowHistory(false);
          setConfirmDelete(session);
        }}
        onClose={() => setShowHistory(false)}
      />

      <ConfirmDialog
        visible={confirmDelete !== null}
        title="Delete chat?"
        message={confirmDelete?.title}
        onClose={() => setConfirmDelete(null)}
        actions={[
          { label: 'CANCEL', onPress: () => setConfirmDelete(null) },
          {
            label: 'DELETE',
            destructive: true,
            onPress: () => {
              if (confirmDelete) void deleteSession(confirmDelete.id);
              setConfirmDelete(null);
            },
          },
        ]}
      />

      {milestone && goal && (
        <ProgressSheet
          visible={showProgress}
          onClose={() => setShowProgress(false)}
          goalTitle={goal.title}
          goalActive={goal.status === 'active'}
          milestone={milestone}
          telemetry={telemetry}
          onAdjustDates={(which) => {
            setShowProgress(false);
            setEditingDate(which);
          }}
          onArchiveGoal={() => {
            setShowProgress(false);
            void archiveGoal();
          }}
        />
      )}

      <CalendarPicker
        visible={editingDate !== null}
        selectedDate={(editingDate === 'goal' ? goal?.targetDate : milestone?.targetDate) ?? ''}
        minDate={addDaysYmd(currentCompassDay(), 1)}
        onSelectDate={(date) => {
          const which = editingDate;
          setEditingDate(null);
          if (which === 'goal') void updateTargetDates({ goalTargetDate: date });
          else if (which === 'milestone') void updateTargetDates({ milestoneTargetDate: date });
        }}
        onClose={() => setEditingDate(null)}
      />

      <CalendarPicker
        visible={calendarFor !== null}
        selectedDate={(calendarFor === 'goal' ? goalDate : milestoneDate) ?? ''}
        minDate={calendarFor === 'goal' && milestoneDate ? milestoneDate : addDaysYmd(currentCompassDay(), 1)}
        onSelectDate={(date) => {
          if (calendarFor === 'goal') setSession({ goalDate: date });
          else setSession({ milestoneDate: date });
          setCalendarFor(null);
        }}
        onClose={() => setCalendarFor(null)}
      />
        </>
      </DeferredBody>
    </View>
  );
}
