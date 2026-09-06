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
import { useAccountStore } from '@/stores/account';
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

/**
 * Sessions with a rename already in flight.
 *
 * There are four ways to leave a Compass conversation and two of them can land
 * in the same breath — flipping the mode switch and then swiping to the
 * Library. `titledMessageCounts` cannot stop that on its own, since it is only
 * written once the cloud call comes back: without this the same transcript is
 * titled twice, which is two requests and two toasts for one rename.
 */
const titlingInFlight = new Set<string>();

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
    // The conversation being left gets its last chance at a name first. Not
    // awaited: everything the rename needs is read synchronously inside, so
    // the snapshot is of the conversation you are leaving even though the
    // cloud call lands after the switch. See `refineTitleOnExit`.
    void get().refineTitleOnExit().catch(() => {});
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
          goalId: useCompassStore.getState().primaryGoalId,
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
    // Same as `newSession`: name what you are leaving before you leave it.
    void get().refineTitleOnExit().catch(() => {});
    set({ switching: id });
    try {
      if (previous && previous !== id && isEmptySession(previous)) removeSession(previous);

      // A proposal belongs to the conversation that made it, so it does not
      // follow you into a different one.
      useSamwellSessionStore.getState().set({ compassDraft: null, refining: false });
      const messages = readMessages(id);
      /*
       * What this conversation's name already covers.
       *
       * `titledMessageCounts` only remembers what THIS run of the app titled,
       * so a conversation opened from history looked unnamed to the guard and
       * every visit re-titled it — reading one back without saying anything
       * spent a request and raised a toast for a name that did not change.
       * Opening a named conversation records that its name covers everything
       * in it, so leaving only renames it if something was said meanwhile.
       *
       * A placeholder is not a name, so it covers nothing and stays at zero:
       * a conversation whose first title never landed (offline, a failed call)
       * can still pick one up on the way out.
       */
      const named = get().sessions.find((s) => s.id === id)?.title;
      titledMessageCounts.set(
        id,
        named && named !== PLACEHOLDER_TITLE ? realMessageCount(messages) : 0,
      );
      set({
        activeSessionId: id,
        messages,
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

    const { cloudBaseUrl, cloudModelId } = useSettingsStore.getState();
    if (!cloudBaseUrl) {
      set({ error: 'Samwell Cloud is not configured for this build.' });
      return;
    }
    // Compass is cloud-only and the cloud runs on accounts. The empty state
    // already says so and offers the way out; this is the floor under it.
    if (useAccountStore.getState().status !== 'signedIn') {
      set({ error: 'Sign in to use Grand Maester Samwell.' });
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
        onToolStatus: (status, name) =>
          set({
            toolStatus: status,
            toolName: name,
            /*
             * The narration STAYS. Blanking it here is what made a turn look
             * like it restreamed from scratch.
             *
             * `activeAssistantText` reports the assistant message's whole
             * accumulated text, not a delta, and the model keeps writing into
             * the same message after a tool returns. So wiping the bubble on
             * the call did not remove that text from the stream — the very
             * next flush delivered it again, with the continuation appended,
             * and the reader watched a paragraph they had already read type
             * itself out a second time.
             *
             * Leaving it alone costs nothing: text is suppressed while a tool
             * call is pending, so the bubble simply holds what he had said and
             * grows when he resumes.
             */
          }),
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
    /*
     * Everything the rename needs is read here, synchronously, before the
     * first `await`. That is what lets every caller fire this and move on:
     * the session switch that follows can replace `activeSessionId` and
     * `messages` freely, because the cloud call already holds the id and the
     * transcript of the conversation being left. Move a read below the await
     * and a switch will rename the wrong conversation.
     */
    const { activeSessionId, messages } = get();
    if (!activeSessionId) return;
    const count = realMessageCount(messages);
    // Needs at least one full exchange beyond whatever the quick title saw.
    if (count < 2 || count <= (titledMessageCounts.get(activeSessionId) ?? 0)) return;
    if (titlingInFlight.has(activeSessionId)) return;

    const conversation = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => `${m.role === 'user' ? 'User' : 'Samwell'}: ${m.content}`)
      .join('\n');
    titlingInFlight.add(activeSessionId);
    try {
      // Announce this one: it is a rename of a conversation the reader has a
      // name for already, the same event reading chat toasts on leaving.
      await titleFrom(activeSessionId, set, conversation, count, true);
      await get().loadSessions();
    } finally {
      titlingInFlight.delete(activeSessionId);
    }
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
