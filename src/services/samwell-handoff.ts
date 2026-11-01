/**
 * Taking a chat with Samwell to the Samwell page from elsewhere in the app.
 *
 * Every reading chat happens on the hub's Samwell page, the same page and the
 * same composer as every other chat; there is no second chat screen (the
 * onboarding conversation is its own thing). Two ways in:
 * - a chat about a whole book or post waits there as the chat's book until
 *   the first message makes the conversation (`useChatSessions.send`), as
 *   picking a book on the page does;
 * - a chat about a passage (from the reader or the Timeline) is made where
 *   the passage is, with its context, and opened there.
 */
import { cachedChatSessions } from '@/query-manager/chat-sessions';
import type { BookKind } from '@/db/schema';
import { scheduleBackgroundTitles, useChatStore } from '@/stores/chat';
import { HUB, useHubStore } from '@/stores/hub';
import { useSamwellSessionStore } from '@/stores/samwell-session';

/**
 * Leaves the chat on the page for a fresh one: stops a reply in flight,
 * waits out a rename, and clears every turn-local field so a stopped
 * generation cannot leave the page locked while its native promise unwinds.
 */
export async function leaveForNewChat(): Promise<void> {
  const chat = useChatStore.getState();
  if (chat.isGenerating) chat.stopGeneration();
  // A rename started from the history sheet may still be generating.
  await chat.waitForRetitle();
  useChatStore.setState({
    activeSession: null,
    messages: [],
    isGenerating: false,
    isThinking: false,
    isToolCalling: false,
    toolCallStatus: null,
    toolCallName: null,
    streamingContent: '',
    thinkingContent: '',
    thinkingSeconds: null,
    lastStreamedMessageId: null,
    deviceLimit: null,
    queuedBehindTitle: false,
  });
  // The chat just left may still be called "New chat" on device.
  scheduleBackgroundTitles();
}

/**
 * A new chat about one book or post, on the Samwell page. The caller leaves
 * any screen stacked above the hub; the pager honours the page asked for
 * when the hub comes back into view.
 */
export async function askSamwellAbout(book: { id: string; title: string; kind: BookKind }): Promise<void> {
  await leaveForNewChat();
  useSamwellSessionStore.getState().set({ pendingBook: book, mode: 'chat' });
  useHubStore.getState().goTo(HUB.samwell);
}

/**
 * Opens an existing chat on the Samwell page: one just made about a passage,
 * or one a highlight already links to. The caller leaves any screen stacked
 * above the hub.
 */
export async function showChatOnSamwellPage(sessionId: string): Promise<void> {
  const chat = useChatStore.getState();
  // `openSession` names its session from the list, and a chat made or linked
  // elsewhere may not be in it yet; opened without its entry, the page would
  // take it for a new chat and start another on the first message.
  if (!cachedChatSessions('reading').some((s) => s.id === sessionId)) await chat.loadSessions();
  if (useChatStore.getState().activeSession?.id !== sessionId) await chat.openSession(sessionId);
  useSamwellSessionStore.getState().set({ pendingBook: null, mode: 'chat' });
  useHubStore.getState().goTo(HUB.samwell);
}
