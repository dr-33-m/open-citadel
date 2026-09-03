import { create } from 'zustand';

import { db } from '@/db/client';
import { chatSessions } from '@/db/schema';
import {
  appendMessage,
  isEmptySession,
  listSessions,
  readMessages,
  removeSession,
  renameSession,
  touchSession,
  type ChatMessage,
  type ChatSession,
} from '@/services/chat-sessions';
import { suggestChatTitle } from '@/services/chat-title';
import { sendCloudChatTurn } from '@/services/cloud-chat';
import { showToast } from '@/components/toast/toast-provider';
import { useApprovalStore } from '@/stores/approval';
import { useCompassStore } from '@/stores/compass';
import { useSamwellSessionStore } from '@/stores/samwell-session';
import { useSettingsStore } from '@/stores/settings';

/**
 * Compass conversations.
 *
 * A Compass chat is a chat: it has a transcript that survives the app closing,
 * a title Samwell writes for it, a place in a history list, and you can go
 * back into one. It differs from a reading chat only in what Samwell is
 * focused on and which tools he can reach for.
 *
 * Its own store rather than a branch inside the reading one, because the
 * reading store carries device inference, engine priming, book grounding and
 * the spoiler boundary, none of which a Compass turn has any use for. What the
 * two genuinely share — how a session is listed, read, appended to, renamed
 * and deleted — is `services/chat-sessions.ts`, and both go through it. The
 * goal data itself stays in `stores/compass.ts`; this store is only the
 * conversation about it.
 */

/** What a conversation is called before Samwell has named it. */
const PLACEHOLDER_TITLE = 'New conversation';

/**
 * How many real turns a session had when it was last titled.
 *
 * Module state rather than store state, exactly as the reading store does it:
 * it only exists to stop redundant re-titling, so it does not need to persist
 * and must not cause a render.
 */
const titledMessageCounts = new Map<string, number>();

function uuid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Aborts the Compass turn in flight. Module state, same as the reading store:
// `stop` reaches it and nothing renders off it. Null between turns.
let cloudAbort: AbortController | null = null;

function realMessageCount(messages: ChatMessage[]): number {
  return messages.filter((m) => m.role === 'user' || m.role === 'assistant').length;
}

type CompassChatState = {
  sessions: ChatSession[];
  activeSessionId: string | null;
  messages: ChatMessage[];

  /** Non-null while opening or starting a conversation, for the history sheet. */
  switching: 'new' | string | null;

  submitting: boolean;
  streamingReply: string;
  /**
   * The model's reasoning for the turn in flight.
   *
   * Kept after the turn lands rather than cleared with the reply, so the
   * folded "Thought for 8 seconds" row stays with the answer it produced.
   */
  streamingThinking: string;
  /** Measured thinking time for that trace, in whole seconds; null until the
   *  answer starts, and kept alongside `streamingThinking`. */
  streamingThinkingSeconds: number | null;
  /** The reply that was just streamed in — the transcript skips its entrance
   *  animation, since it was already on screen as the streaming bubble. */
  lastStreamedMessageId: string | null;
  toolStatus: string | null;
  toolName: string | null;
  error: string | null;

  loadSessions: () => Promise<void>;
  newSession: () => Promise<void>;
  openSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  /** Aborts the turn in flight. The reply keeps whatever streamed before the
   *  tap; no error is raised. */
  stop: () => void;
  /** Re-titles the open conversation from the whole transcript if it has
   *  grown since it was last named. Called on leaving, as reading chat does. */
  refineTitleOnExit: () => Promise<void>;
  clearError: () => void;
};

/** Everything about a turn in flight, cleared when one ends or is abandoned. */
const IDLE = {
  submitting: false,
  streamingReply: '',
  toolStatus: null,
  toolName: null,
  // Null by default; a successful commit sets it right after spreading IDLE.
  lastStreamedMessageId: null,
} as const;

export const useCompassChatStore = create<CompassChatState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  switching: null,
  submitting: false,
  streamingReply: '',
  streamingThinking: '',
  streamingThinkingSeconds: null,
  lastStreamedMessageId: null,
  toolStatus: null,
  toolName: null,
  error: null,

  loadSessions: async () => {
    set({ sessions: listSessions('compass') });
  },

  newSession: async () => {
    const previous = get().activeSessionId;
    set({ switching: 'new' });
    try {
      /*
       * An untouched conversation is not history.
       *
       * Starting a new one while the current has nothing in it would otherwise
       * leave a trail of "New conversation" rows nobody opened, which is a
       * history list that gets worse the more you use it.
       */
      if (previous && isEmptySession(previous)) removeSession(previous);

      const id = uuid();
      const ts = new Date().toISOString();
      db.insert(chatSessions)
        .values({
          id,
          bookId: null,
          // The goal this conversation started against, recorded rather than
          // filtered on: the conversation that talked someone into their goal
          // belongs to that goal's history too.
          goalId: useCompassStore.getState().activeGoalId,
          kind: 'compass',
          title: PLACEHOLDER_TITLE,
          contextText: null,
          contextLocator: null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();

      useSamwellSessionStore.getState().set({ compassDraft: null, refining: false });
      set({ activeSessionId: id, messages: [], streamingThinking: '', streamingThinkingSeconds: null, error: null, ...IDLE });
      await get().loadSessions();
    } finally {
      set({ switching: null });
    }
  },

  openSession: async (id) => {
    if (get().activeSessionId === id) return;
    const previous = get().activeSessionId;
    set({ switching: id });
    try {
      if (previous && previous !== id && isEmptySession(previous)) removeSession(previous);

      // A proposal belongs to the conversation that made it, so it does not
      // follow you into a different one.
      useSamwellSessionStore.getState().set({ compassDraft: null, refining: false });
      set({
        activeSessionId: id,
        messages: readMessages(id),
        streamingThinking: '',
        streamingThinkingSeconds: null,
        error: null,
        ...IDLE,
      });
      await get().loadSessions();
    } finally {
      set({ switching: null });
    }
  },

  deleteSession: async (id) => {
    removeSession(id);
    useApprovalStore.getState().clearSession(id);
    titledMessageCounts.delete(id);
    const wasActive = get().activeSessionId === id;
    set((state) => ({
      sessions: state.sessions.filter((session) => session.id !== id),
      ...(wasActive
        ? { activeSessionId: null, messages: [], streamingThinking: '', streamingThinkingSeconds: null, ...IDLE }
        : {}),
    }));
    if (wasActive) useSamwellSessionStore.getState().set({ compassDraft: null, refining: false });
  },

  send: async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Started on the first thing said rather than on arrival, so opening
    // Compass and closing it again leaves nothing behind.
    if (!get().activeSessionId) await get().newSession();
    const sessionId = get().activeSessionId;
    if (!sessionId) return;

    const { cloudBaseUrl, getCloudDeviceId, cloudModelId } = useSettingsStore.getState();
    if (!cloudBaseUrl) {
      set({ error: 'Samwell Cloud is not configured for this build.' });
      return;
    }

    const history = get().messages;
    const userMessage: ChatMessage = {
      id: uuid(),
      sessionId,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    appendMessage(userMessage);

    // Sending is what clears a draft: they have said something new, so
    // whatever Samwell last proposed is now the previous version.
    useSamwellSessionStore.getState().set({ compassDraft: null, refining: false });
    set({
      messages: [...history, userMessage],
      submitting: true,
      streamingReply: '',
      streamingThinking: '',
      streamingThinkingSeconds: null,
      lastStreamedMessageId: null,
      error: null,
    });

    cloudAbort = new AbortController();
    try {
      // No journey block assembled here: `sendCloudChatTurn` adds it to every
      // cloud turn, so reading chat and Compass cannot end up sending
      // different versions of what Samwell knows about the same person.
      const reply = await sendCloudChatTurn({
        baseUrl: cloudBaseUrl,
        deviceId: await getCloudDeviceId(),
        modelId: cloudModelId,
        sessionId,
        bookId: null,
        mode: 'compass',
        history,
        content: trimmed,
        signal: cloudAbort.signal,
        onStreamingContent: (content) => set({ streamingReply: content }),
        onThinkingContent: (content) => set({ streamingThinking: content }),
        onThinkingDone: (seconds) => set({ streamingThinkingSeconds: seconds }),
        onToolStatus: (status, name) => set({ toolStatus: status, toolName: name }),
      });

      // Nothing came back: the turn was called off, or it ended empty. Drop it
      // rather than writing a blank bubble into the transcript.
      if (!reply.trim()) {
        if (get().activeSessionId === sessionId) set({ ...IDLE });
        return;
      }

      const assistantMessage: ChatMessage = {
        id: uuid(),
        sessionId,
        role: 'assistant',
        content: reply,
        createdAt: new Date().toISOString(),
      };
      appendMessage(assistantMessage);
      touchSession(sessionId, assistantMessage.createdAt);

      /*
       * Only onto the transcript this reply belongs to.
       *
       * The row is written either way, so nothing is lost by the conversation
       * having moved on. What must not happen is the second half: pushing the
       * answer to a question asked in one conversation into whichever one is
       * open now. The UI disables the history control mid-turn, so this is the
       * belt to that brace, and it is the same failure the reading store's
       * `openSession` documents having already been bitten by.
       */
      if (get().activeSessionId === sessionId) {
        set((state) => ({
          // Appended to what is in the store rather than to the array this
          // turn started with: approving a proposal mid-turn can change it.
          messages: [...state.messages, assistantMessage],
          ...IDLE,
          // Already on screen as the streaming bubble — no arrival animation.
          lastStreamedMessageId: assistantMessage.id,
        }));
      } else {
        set({ ...IDLE });
      }

      /*
       * Named from the first exchange, then left alone until they leave.
       * Titling is a cloud call, so doing it every turn would spend a request
       * on renaming a conversation nobody has stopped having.
       */
      if (!titledMessageCounts.has(sessionId)) {
        // Counted from the rows, not from the store: the store may be showing
        // a different conversation by now. Silent — this is the first name,
        // not a rename worth announcing.
        await titleFrom(
          sessionId,
          set,
          `User: ${trimmed}\nSamwell: ${reply}`,
          realMessageCount(readMessages(sessionId)),
          false,
        );
      }
      await get().loadSessions();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Something went wrong. Try again.',
        ...IDLE,
      });
    } finally {
      cloudAbort = null;
    }
  },

  stop: () => {
    cloudAbort?.abort();
  },

  refineTitleOnExit: async () => {
    const { activeSessionId, messages } = get();
    if (!activeSessionId) return;
    const count = realMessageCount(messages);
    // Needs at least one full exchange beyond whatever the quick title saw.
    if (count < 2 || count <= (titledMessageCounts.get(activeSessionId) ?? 0)) return;

    const conversation = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => `${m.role === 'user' ? 'User' : 'Samwell'}: ${m.content}`)
      .join('\n');
    // Announce this one: it is a rename of a conversation the reader has a
    // name for already, the same event reading chat toasts on leaving.
    await titleFrom(activeSessionId, set, conversation, count, true);
    await get().loadSessions();
  },

  clearError: () => set({ error: null }),
}));

/**
 * Name the conversation from whatever it has been about.
 *
 * Best effort by design: a failed title leaves the placeholder in place, which
 * is a worse list and not a broken one. Titling is a cloud call, so it must
 * never be the thing that makes a successful turn look like a failure.
 */
async function titleFrom(
  sessionId: string,
  set: (patch: Partial<CompassChatState>) => void,
  conversation: string,
  count: number,
  announce: boolean,
): Promise<void> {
  try {
    const title = await suggestChatTitle(conversation);
    if (!title) return;
    renameSession(sessionId, title);
    titledMessageCounts.set(sessionId, count);
    set({ sessions: listSessions('compass') });
    // The same notice reading chat raises, through the same bridge, so a
    // rename reads identically whichever surface you were on.
    if (announce) showToast({ message: `Renamed to "${title}"`, tone: 'success' });
  } catch (err) {
    console.warn('[Compass] Could not auto-title conversation:', err);
  }
}

export const useCompassChatMessages = () => useCompassChatStore((s) => s.messages);
export const useCompassChatSessions = () => useCompassChatStore((s) => s.sessions);
export const useCompassChatError = () => useCompassChatStore((s) => s.error);
