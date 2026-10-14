import { onboardingSetupNotes } from 'samwell-shared';
import { create } from 'zustand';

import { db } from '@/db/client';
import { chatSessions } from '@/db/schema';
import {
    appendMessage,
    listSessions,
    readMessages,
    touchSession,
    type ChatMessage,
} from '@/services/chat-sessions';
import { sayCloudTurnBlocked, sayCloudTurnFailed, sendCloudChatTurn } from '@/services/cloud-chat';
import { cloudHeaders } from '@/services/cloud-identity';
import { hasLibrary } from '@/services/library-setup';
import { clearShortlists } from '@/services/onboarding-tools/shortlist';
import { useAccountStore } from '@/stores/account';
import { useSettingsStore } from '@/stores/settings';

/**
 * The concierge conversation.
 *
 * A third chat store, and the smallest of the three. It is deliberately not a
 * branch inside either of the others: the reading store carries device
 * inference, engine priming, book grounding and the spoiler boundary, and the
 * Compass store carries goals, proposals and re-titling. Onboarding has one
 * session, one title, no history list and nothing to switch between, so
 * folding it into either would mean adding a mode to code that is already
 * doing two jobs.
 *
 * What all three genuinely share — how a session is created, listed, read,
 * appended to and touched — is `services/chat-sessions.ts`, and this goes
 * through it like the others. That is what makes the conversation survive the
 * app being killed halfway through, which matters more here than anywhere
 * else: a first run that starts over from the greeting is a first run nobody
 * finishes.
 */

/** Fixed. There is one of these per person and it is never renamed. */
const SESSION_TITLE = 'Concierge onboarding';

/**
 * What the GET STARTED button says on the reader's behalf.
 *
 * A visible message rather than a silent trigger, because the transcript
 * should read as a conversation somebody had rather than one that began with
 * Samwell talking to himself. Their name reaches him through the setup notes
 * instead, so he is not made to look as though he asked for it.
 */
export const OPENING_MESSAGE = 'Get started';

function uuid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Is there a concierge conversation already on this device?
 *
 * Read synchronously, before the welcome screen draws, so somebody whose app
 * was killed mid-onboarding — which happens routinely, since the system folder
 * picker backgrounds the app — comes back to the conversation rather than to
 * the two doors they already chose between.
 */
export function hasOnboardingSession(): boolean {
  return listSessions('onboarding').length > 0;
}

/** Aborts the turn in flight. Module state: `stop` reaches it, nothing draws it. */
let cloudAbort: AbortController | null = null;

/**
 * A `start()` already running, so a second caller joins it rather than racing.
 *
 * There are two callers and they can overlap: the screen fires one the moment
 * the conversation opens, and `send` fires another if GET STARTED is pressed
 * before the first has finished. Both would find `sessionId` still null and
 * both would insert a session, leaving a duplicate conversation and a
 * transcript split across two of them.
 */
let starting: Promise<void> | null = null;

type OnboardingChatState = {
  sessionId: string | null;
  messages: ChatMessage[];
  submitting: boolean;
  streamingReply: string;
  streamingThinking: string;
  streamingThinkingSeconds: number | null;
  lastStreamedMessageId: string | null;
  toolStatus: string | null;
  toolName: string | null;
  /**
   * This account's free introduction is spent, so the conversation goes down
   * the metered route instead. See `metered` in `CloudChatTurnOptions`.
   */
  metered: boolean;

  /** Resolve or create the session. Safe to call more than once. */
  start: () => Promise<void>;
  send: (text: string) => Promise<void>;
  stop: () => void;
};

const IDLE = {
  submitting: false,
  streamingReply: '',
  toolStatus: null,
  toolName: null,
  lastStreamedMessageId: null,
} as const;

/** The grant check is only a routing hint; it must never hold up onboarding. */
const GRANT_STATUS_TIMEOUT_MS = 5_000;

/**
 * Has this account already had its free conversation?
 *
 * Asked once, at the start, so the answer is settled before the reader presses
 * anything. A server that cannot be reached is treated as "free": the turn
 * itself will fail in a moment and say so properly, and guessing "metered"
 * here would quietly bill somebody because of a network blip.
 */
async function grantIsSpent(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GRANT_STATUS_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/onboarding/status`, {
      headers: await cloudHeaders(),
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { open?: boolean };
    return body.open === false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export const useOnboardingChatStore = create<OnboardingChatState>((set, get) => ({
  sessionId: null,
  messages: [],
  submitting: false,
  streamingReply: '',
  streamingThinking: '',
  streamingThinkingSeconds: null,
  lastStreamedMessageId: null,
  toolStatus: null,
  toolName: null,
  metered: false,

  start: async () => {
    if (starting) return starting;
    if (get().sessionId) return;

    starting = (async () => {
      /*
       * An existing conversation is resumed rather than replaced.
       *
       * The app can be killed at any point in this — during a folder pick, in
       * fact, since the system picker puts Open Citadel in the background. There
       * is at most one of these per person, so the newest one IS the one.
       */
      const existing = listSessions('onboarding')[0];
      if (existing) {
        set({ sessionId: existing.id, messages: readMessages(existing.id) });
      } else {
        const id = uuid();
        const ts = new Date().toISOString();
        db.insert(chatSessions)
          .values({
            id,
            bookId: null,
            goalId: null,
            kind: 'onboarding',
            title: SESSION_TITLE,
            contextText: null,
            contextLocator: null,
            createdAt: ts,
            updatedAt: ts,
          })
          .run();

        /*
         * The setup notes, written once into the transcript.
         *
         * Persisted rather than rebuilt per turn, unlike the journey block on
         * the other two surfaces, because every fact in them is about the moment
         * onboarding started. Rebuilding would mean that halfway through, after
         * `set_up_library` has run, the notes would start saying they already
         * have a library and Samwell would be told to skip the step he is in the
         * middle of.
         */
        const notes = onboardingSetupNotes({
          name: useAccountStore.getState().name,
          platform: process.env.EXPO_OS === 'ios' ? 'ios' : 'android',
          hasLibrary: await hasLibrary(),
        });
        appendMessage({
          id: uuid(),
          sessionId: id,
          role: 'system',
          content: notes,
          createdAt: ts,
        });

        clearShortlists();
        set({ sessionId: id, messages: readMessages(id) });
      }

      const { cloudBaseUrl } = useSettingsStore.getState();
      if (cloudBaseUrl) set({ metered: await grantIsSpent(cloudBaseUrl) });
    })();

    try {
      await starting;
    } finally {
      starting = null;
    }
  },

  send: async (text) => {
    const trimmed = text.trim();
    if (!trimmed || get().submitting) return;

    /*
     * Always awaited, never conditionally.
     *
     * It returns immediately once there is a session, so the cost is nil, and
     * the guard it replaces (`if (!sessionId)`) skipped the wait whenever the
     * screen had already fired a start that was still in flight — which is the
     * common case, and it meant the turn went out before `metered` was known
     * and took the free route on an account whose grant was already spent.
     */
    await get().start();
    const sessionId = get().sessionId;
    if (!sessionId) return;

    const { cloudBaseUrl, cloudModelId } = useSettingsStore.getState();
    if (!cloudBaseUrl) {
      sayCloudTurnBlocked('Samwell Cloud is not set up in this build.');
      return;
    }
    // The concierge runs on an account by definition: the welcome screen only
    // opens this after a sign-in. This is the floor under that.
    if (useAccountStore.getState().status !== 'signedIn') {
      sayCloudTurnBlocked('Sign in to talk to Grand Maester Samwell.');
      return;
    }

    const history = get().messages;
    const userMessage: ChatMessage = {
      id: uuid(),
      sessionId,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
      // Onboarding only runs in the cloud; see `chat_messages.via`.
      via: 'cloud',
    };
    appendMessage(userMessage);

    set({
      messages: [...history, userMessage],
      submitting: true,
      streamingReply: '',
      streamingThinking: '',
      streamingThinkingSeconds: null,
      lastStreamedMessageId: null,
    });

    cloudAbort = new AbortController();
    try {
      const reply = await sendCloudChatTurn({
        baseUrl: cloudBaseUrl,
        // Read but unused on the free route, where the server picks the model.
        // Sent anyway so the metered fallback below needs no second code path.
        modelId: cloudModelId,
        sessionId,
        bookId: null,
        mode: 'onboarding',
        metered: get().metered,
        /*
         * Five minutes, not the usual two.
         *
         * `set_up_library` and `download_free_books` both hand off to a system
         * picker. Android backgrounds the whole app behind it, nothing streams
         * while it is open, and the wait being measured is a person looking
         * through their own folders for where their books live. Giving up on
         * that after two minutes abandons the turn at the exact moment they
         * come back having done what was asked.
         */
        inactivityMs: 300_000,
        history,
        content: trimmed,
        signal: cloudAbort.signal,
        onStreamingContent: (content) => set({ streamingReply: content }),
        onThinkingContent: (content) => set({ streamingThinking: content }),
        onThinkingDone: (seconds) => set({ streamingThinkingSeconds: seconds }),
        // The bubble is not blanked on a tool call: the narration before it
        // becomes a message of its own instead. See `onReplyPart`.
        onToolStatus: (status, name) => set({ toolStatus: status, toolName: name }),
        /*
         * The app's record of what a tool really did, kept in the transcript.
         *
         * The history each turn sends is the words of the conversation, not
         * the tool calls in it, so without this a later turn saw Samwell
         * claiming books were downloaded with nothing to show it happened, and
         * he told the reader, "to be honest", that nothing had been added.
         * Written as a system message: the transcript hides those, the server
         * hands them to him as notes, and they survive the app being killed.
         */
        /*
         * Each stretch of his reply between two tool calls is its own
         * message, not a bubble that grows three times over. Written once it
         * has been shown in full, in the same update that empties the
         * streaming bubble, so the hand-over does not jump.
         */
        onReplyPart: (text) => {
          const part: ChatMessage = {
            id: uuid(),
            sessionId,
            role: 'assistant',
            content: text,
            createdAt: new Date().toISOString(),
            via: 'cloud',
          };
          appendMessage(part);
          touchSession(sessionId, part.createdAt);
          set((state) => ({
            messages: [...state.messages, part],
            streamingReply: '',
            lastStreamedMessageId: part.id,
          }));
        },
        onOnboardingAction: (note) => {
          const record: ChatMessage = {
            id: uuid(),
            sessionId,
            role: 'system',
            content: note,
            createdAt: new Date().toISOString(),
          };
          appendMessage(record);
          set((state) => ({ messages: [...state.messages, record] }));
        },
      });

      /*
       * A turn can legitimately end with no words.
       *
       * `finish_onboarding` is the case: Samwell says his goodbye, then calls
       * it, and the continuation has nothing left to add. Writing an empty
       * bubble for that would put a blank message under his last one.
       */
      if (!reply.trim()) {
        set({ ...IDLE });
        return;
      }

      const assistantMessage: ChatMessage = {
        id: uuid(),
        sessionId,
        role: 'assistant',
        content: reply,
        createdAt: new Date().toISOString(),
        via: 'cloud',
      };
      appendMessage(assistantMessage);
      touchSession(sessionId, assistantMessage.createdAt);

      set((state) => ({
        messages: [...state.messages, assistantMessage],
        ...IDLE,
        // Already on screen as the streaming bubble, so it arrives without an
        // entrance animation.
        lastStreamedMessageId: assistantMessage.id,
      }));
    } catch (err) {
      sayCloudTurnFailed(err);
      set({ ...IDLE });
    } finally {
      cloudAbort = null;
    }
  },

  stop: () => {
    cloudAbort?.abort();
  },
}));
