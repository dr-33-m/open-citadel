import { eq } from 'drizzle-orm';
import { create } from 'zustand';

import { db } from '@/db/client';
import { books, chatMessages, chatSessions, readingProgress } from '@/db/schema';
import { extractChapterTextToLocator } from '@/services/book-context';
import {
    listSessions,
    readMessages,
    removeSession,
    renameSession,
    type ChatMessage,
    type ChatSession,
} from '@/services/chat-sessions';
import { conversationForTitle, RetitleError, suggestChatTitle } from '@/services/chat-title';
import {
    APPROVAL_REQUIRED_TOOLS,
    ensureBookMarkers,
    executeToolCall,
    formatToolResultForLLM,
    toolStatus,
    type BookCandidate,
    type ToolCallContext,
} from '@/services/chat-tools';
import { isToolCallMessage, TOOL_CALL_PREFIX } from '@/services/chat-transcript';
import { asCloudRefusal, sendCloudChatTurn } from '@/services/cloud-chat';
import { estimateTokens, planReplay, type ReplayMessage } from '@/services/context-budget';
import { splitThinking } from '@/utils/think-stream';
import * as Inference from '@/services/inference';
import { deviceToolResultBudget, TOOL_RESULT_TOKEN_BUDGET } from '@/services/tool-limits';
import { useAccountStore } from '@/stores/account';
import { useApprovalStore } from '@/stores/approval';
import { useModelStore } from '@/stores/model';
import { useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';

/**
 * Re-exported rather than redefined: a session is a session whichever surface
 * opened it, and the many call sites that already import these from here keep
 * working while the shapes live with the queries that produce them.
 */
export type { ChatMessage, ChatSession };

interface ChatStore {
  sessions: ChatSession[];
  activeSession: ChatSession | null;
  messages: ChatMessage[];
  isGenerating: boolean;
  isThinking: boolean;
  isToolCalling: boolean;
  toolCallStatus: string | null;
  /** The tool actually running, so the indicator can pick a truthful shape
   *  rather than showing one generic "busy" glyph for every tool. */
  toolCallName: string | null;
  streamingContent: string;
  thinkingContent: string;
  /** Measured thinking time for the turn in flight, in whole seconds. Set by
   *  the cloud path once the answer starts; null when unknown, and the trace
   *  row falls back to timing itself. */
  thinkingSeconds: number | null;
  /** The id of the assistant message that was just streamed in. The transcript
   *  skips the rise-and-fade entrance for it — it was already on screen as the
   *  streaming bubble, so animating its "arrival" is the flick the reader
   *  sees when a reply finishes. Cleared when the next turn starts. */
  lastStreamedMessageId: string | null;
  primedGeneration: number | null;
  /** Why on-device Samwell had to stop, if he did. Set instead of attempting
   * a native call we know would be unsafe: `context` when the turn no longer
   * fits the engine's KV cache even after compaction, `memory` when the
   * device itself is out of headroom. Both would otherwise surface as a hard
   * native abort that no catch block can intercept, so the UI offers a way
   * forward from here instead. */
  deviceLimit: DeviceLimit | null;
  /** A summary/re-title pass is running and the reader is waiting on it. */
  titleRefreshing: boolean;

  loadSessions(): Promise<void>;
  createSession(opts: {
    bookId?: string;
    title: string;
    contextText?: string;
    passageText?: string;
    contextLocator?: string;
  }): Promise<string>;
  openSession(id: string): Promise<void>;
  /**
   * @param id The id the caller has already rendered this message under, so
   * the optimistic bubble and the committed one are the same React element
   * rather than two that swap. Minted here when absent.
   */
  sendMessage(content: string, id?: string): Promise<void>;
  stopGeneration(): void;
  deleteSession(id: string): Promise<void>;
  updateSessionTitle(id: string, title: string): Promise<void>;
  /** Best-effort quick title from a bookless session's opening exchange.
   * Never throws — a failure just leaves the placeholder title in place. */
  maybeTitleFirstMessage(sessionId: string, userText: string, assistantText: string): Promise<void>;
  /**
   * Re-titles a past bookless chat from everything said in it, when the reader
   * asks (a swipe on its row). Resolves to the title it now has; rejects when
   * it could not, with a `RetitleError` when the reason is worth showing.
   */
  retitleSession(id: string): Promise<string>;
  /**
   * Resolves once no rename is using the local engine. Everything that resets
   * or generates on the engine waits here first, because a rename can now be
   * started from the history sheet at any moment, including just before a
   * switch or a send.
   */
  waitForRetitle(): Promise<void>;
  clearDeviceLimit(): void;
}

/**
 * What a bookless conversation is called before it has been named.
 *
 * Exported so the code that creates a session and anything that asks whether
 * one has been named yet mean the same string.
 */
export const NEW_CHAT_TITLE = 'New chat';

/**
 * The rename currently running. One at a time: on device it is a generation on
 * the one local engine, and `sendMessage` waits it out rather than share it.
 */
let titleRefineInFlight: Promise<string> | null = null;
/** Whether that rename is a local generation rather than a cloud call. */
let titleRefineOnEngine = false;

/**
 * Set by `stopGeneration`, cleared when a turn starts, read by the on-device
 * tool loop.
 *
 * Cancelling the engine ends the reply it is generating, but a reply that had
 * already asked for a tool still comes back carrying that request, and the
 * loop used to honour it: run the tool, send the result, and set the engine
 * generating again. That was the stop that did not stop.
 */
let stopRequested = false;

/**
 * Route one on-device token stream into the same store writes the cloud path
 * makes.
 *
 * Cloud gets two callbacks and keeps them apart: `onStreamingContent` never
 * touches the trace, `onThinkingContent` never touches the answer, and
 * `onThinkingDone` reports how long the reasoning took. On device there is one
 * undifferentiated channel, so the split happens here — but the writes it
 * produces are deliberately the same shape, because anything else makes the
 * two surfaces behave differently for no reason the reader could name.
 *
 * Writing both halves on every token is what made the bubble jump: during
 * reasoning it set `streamingContent` to an empty string over and over while
 * the trace grew, so the answer arrived as a jump from nothing rather than as
 * a continuation.
 *
 * Returns the function to call when the stream ends, which closes off the
 * timing for a reply that finished while still inside a reasoning block.
 */
function onDeviceStreamWriter() {
  let thinkingStartedAt: number | null = null;

  const finishThinking = () => {
    if (thinkingStartedAt === null) return;
    useChatStore.setState({
      thinkingSeconds: Math.max(1, Math.round((Date.now() - thinkingStartedAt) / 1000)),
    });
    thinkingStartedAt = null;
  };

  return {
    push(raw: string) {
      /*
       * Both channels are trimmed at the edges before they are shown.
       *
       * The markers are written with newlines around them — a model emits
       * `<think>\n … \n</think>\n\n` — so the raw split hands back a trace
       * that opens with a blank line and an answer that opens with two. Shown
       * verbatim, the first reads as a large unexplained gap above the
       * reasoning and the second as a tall empty bubble that collapses once
       * real text arrives. Trimming is safe on every pass because the whole
       * accumulated text is re-split each time.
       */
      const split = splitThinking(raw);

      if (split.isThinking) {
        // Measured from the first reasoning token, the same moment the server
        // starts its own clock.
        if (thinkingStartedAt === null) thinkingStartedAt = Date.now();
        useChatStore.setState({ isThinking: true, thinkingContent: split.thinking.trim() });
        return;
      }

      finishThinking();
      useChatStore.setState({
        isThinking: false,
        isToolCalling: false,
        toolCallStatus: null,
        toolCallName: null,
        /*
         * Trimmed at the front, because a reasoning model's first tokens after
         * `</think>` are the blank lines that separated the trace from the
         * answer. Passed through, they are content as far as the transcript is
         * concerned: the streaming bubble appears holding two empty lines, at
         * the height of a two-line reply, and then collapses to one line when
         * the first real sentence lands. Safe to trim on every pass because
         * the whole accumulated text is re-split each time, and no answer
         * legitimately opens with whitespace.
         */
        streamingContent: split.visible.trimStart(),
        // Carried over once the block closes, so the finished trace is there
        // to fold away rather than disappearing with the last thinking token.
        ...(split.thinking ? { thinkingContent: split.thinking.trim() } : {}),
      });
    },
    /**
     * An empty chunk from a model that reasons.
     *
     * Gemma's reasoning never reaches this stream as text: the engine routes it
     * to its own `thought` channel and hands JS an empty chunk for each piece,
     * with the finished trace only arriving on `thinkingText` at the end. So
     * for a reasoning model an empty chunk mid-turn is the thinking, and it is
     * timed and shown as such.
     */
    thinkingWithoutText() {
      if (thinkingStartedAt === null) thinkingStartedAt = Date.now();
      useChatStore.setState({ isThinking: true });
    },
    finish: finishThinking,
  };
}

/** Whether the loaded on-device model is one that reasons before it answers. */
function activeModelReasons(): boolean {
  const { models, activeModelId } = useModelStore.getState();
  return models.find((m) => m.id === activeModelId)?.supportsThinking ?? false;
}

function realMessageCount(messages: ChatMessage[]): number {
  return messages.filter((m) => m.role === 'user' || m.role === 'assistant').length;
}

// Base identity for sessions started without a book. The engine-level system
// prompt (inference.ts) doesn't reliably steer the small on-device model on its
// own, so we persist + prime this as a conversation turn — the same mechanism
// that makes book-context sessions work.
const BASE_SYSTEM_PROMPT =
  'Your name is Samwell. You are a curious, widely-read AI reading companion. ' +
  'Help the user think through ideas, discuss books and concepts, and connect ' +
  'what they read to their goals. Be precise, direct, and concise. Match your ' +
  'response length to the question and never pad.';

/*
 * No journey block here any more, and that is the point.
 *
 * It used to be concatenated into this seed at session creation, which froze
 * it: a chat started in March kept telling Samwell about the book you were
 * reading in March, forever. The live snapshot now travels with each cloud
 * turn from `cloud-chat.ts`, so both surfaces send the same thing and both
 * send it fresh.
 *
 * The on-device path sends none at all. Journey memory is cloud-only, and
 * removing it from the seed is what makes that true rather than nearly true:
 * an offline session used to get the reading half baked in here, and its
 * ~400 tokens were charged against a 4096-token window on every conversation.
 */


/**
 * How this store names a session or a message.
 *
 * Exported because `use-chat-sessions` has to mint a message id BEFORE
 * `sendMessage` runs, so the optimistic bubble can be drawn under the id the
 * message will be committed with. One definition, so the two can never
 * disagree about the shape of an id.
 */
export function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Aborts the cloud turn in flight. Module state, not store state: `stop` needs
// to reach it and nothing renders off it. Null between turns.
let cloudAbort: AbortController | null = null;

function now(): string {
  return new Date().toISOString();
}

/** Why on-device generation had to stop. See {@link ChatStore.deviceLimit}. */
export type DeviceLimit = 'context' | 'memory';

/**
 * Free the engine's KV cache without losing the thread, by rebuilding the
 * conversation around the session's context plus as much recent history as
 * still fits.
 *
 * Serves both jobs the engine has, because they are the same operation:
 * priming a conversation the engine has never seen (a session reopened after
 * a restart, or after Samwell was woken again), and compacting one that has
 * outgrown its KV cache. Priming used to send only the session's system
 * message, so Samwell came back with the book context but no memory of the
 * conversation still on screen — he could not answer a question about a book
 * he had recommended a message earlier. Cloud never had this problem: it
 * sends the whole history with every request.
 *
 * Silent by design: the recent exchange survives intact, so announcing it in
 * the transcript would be noise. Only the case compaction cannot fix
 * (`deviceLimit`) is ever surfaced to the reader.
 */
async function seedEngineWithSession(excludeMessageId?: string): Promise<void> {
  const { messages } = useChatStore.getState();

  const systemContext = messages.find((m) => m.role === 'system')?.content;
  const history = messages
    .filter(
      (m) =>
        (m.role === 'user' || m.role === 'assistant') &&
        !isToolCallMessage(m.content) &&
        // The turn being sent right now is already in `messages`; replaying it
        // here would seed it into the conversation and then send it again.
        m.id !== excludeMessageId,
    )
    .map((m) => ({ role: m.role === 'assistant' ? ('model' as const) : ('user' as const), content: m.content }));

  const plan = planReplay(history, Inference.replayTokenBudget(), systemContext);

  const seed: ReplayMessage[] = [];
  // Replayed as a user turn to match how this session was primed originally;
  // the engine-level system prompt is reapplied by the conversation itself.
  if (systemContext) seed.push({ role: 'user', content: systemContext });
  seed.push(...plan.messages);

  const native = await Inference.compactConversation(seed);
  console.log(
    `[Chat] Seeded engine: replayed ${plan.messages.length} turn(s), dropped ${plan.dropped}` +
      `${native ? '' : ' (fallback replay)'}`,
  );

  // The seed carries this session's context, so priming is satisfied.
  useChatStore.setState({ primedGeneration: Inference.getGeneration() });
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  activeSession: null,
  messages: [],
  isGenerating: false,
  isThinking: false,
  isToolCalling: false,
  toolCallStatus: null, toolCallName: null,
  streamingContent: '',
  thinkingContent: '',
  thinkingSeconds: null,
  lastStreamedMessageId: null,
  primedGeneration: null,
  deviceLimit: null,
  titleRefreshing: false,

  async loadSessions() {
    // Reading only. Compass conversations live in the same two tables and are
    // listed by their own surface; mixing them would put a goal check-in in
    // the reading history, where it answers nobody's question.
    set({ sessions: listSessions('reading') });
  },

  async createSession({ bookId, title, contextText, passageText, contextLocator }) {
    const id = uuid();
    const ts = now();
    // Spoiler boundary: Samwell may only discuss what the user has read.
    const progress = bookId
      ? db
          .select({
            percentage: readingProgress.percentage,
            currentPage: readingProgress.currentPage,
            locator: readingProgress.locator,
          })
          .from(readingProgress)
          .where(eq(readingProgress.bookId, bookId))
          .get()
      : undefined;
    const readPct = progress ? Math.round(progress.percentage * 100) : null;
    const boundaryLine =
      readPct !== null
        ? `The user has read ${readPct}% of this book${
            progress?.currentPage ? ` (up to page ${progress.currentPage})` : ''
          }. Hard rule: never reveal, discuss, or hint at plot events, characters, or ideas that appear beyond that point, not from the book text and not from your own knowledge of the book. If asked about later content, say you will discuss it once they have read that far.`
        : null;

    db.insert(chatSessions)
      .values({
        id,
        bookId: bookId ?? null,
        kind: 'reading',
        title,
        contextText: contextText ?? null,
        contextLocator: contextLocator ?? null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    // Persist the system message so history is always complete when reloading
    if (contextText || passageText) {
      const bookRow = bookId
        ? db.select({ title: books.title, author: books.author }).from(books).where(eq(books.id, bookId)).get()
        : null;

      const bookLine = bookRow
        ? `You are discussing "${bookRow.title}" by ${bookRow.author}. `
        : '';

      // When the user highlighted a specific passage, keep the surrounding
      // chapter text as background but tell the model to focus on the passage
      // itself — otherwise it treats the whole preceding chapter as equally
      // relevant and loses track of what the user actually selected.
      const backgroundSection = contextText
        ? `Here is the context leading up to a passage the user highlighted:\n\n${contextText}\n\n`
        : '';

      const systemContent = passageText
        ? `${bookLine}${backgroundSection}` +
          `The user specifically highlighted this passage. Focus your answers on it${contextText ? ', using the context above only as background' : ''}:\n\n${passageText}\n\n` +
          'Answer questions about the highlighted passage, provide analysis, and discuss themes. Be concise and insightful.' +
          (boundaryLine ? `\n\n${boundaryLine}` : '')
        : `${bookLine}The user is reading the following passage:\n\n${contextText}\n\n` +
          'Answer questions about it, provide analysis, and discuss themes. Be concise and insightful.' +
          (boundaryLine ? `\n\n${boundaryLine}` : '');

      db.insert(chatMessages)
        .values({
          id: uuid(),
          sessionId: id,
          role: 'system',
          content: systemContent,
          createdAt: ts,
        })
        .run();
    } else if (bookId) {
      const bookRow = db
        .select({ title: books.title, author: books.author, filePath: books.filePath })
        .from(books)
        .where(eq(books.id, bookId))
        .get();

      if (bookRow) {
        // Ground book-level chats in the text the user has actually read,
        // sliced up to their current position — not the model's own memory
        // of the book.
        let readExcerpt = '';
        if (progress?.locator && bookRow.filePath) {
          try {
            const readText = await extractChapterTextToLocator(
              bookRow.filePath,
              JSON.parse(progress.locator),
            );
            if (readText.trim().length > 0) {
              readExcerpt = `\n\nFor grounding, this is the text the user most recently read, ending at their current position:\n"…${readText.trim()}"`;
            }
          } catch {
            // Fall back to metadata-only context.
          }
        }

        db.insert(chatMessages)
          .values({
            id: uuid(),
            sessionId: id,
            role: 'system',
            content:
              `You are a reading assistant for "${bookRow.title}" by ${bookRow.author}. Help the user understand, analyse, and discuss the book. Be concise and insightful.` +
              readExcerpt +
              (boundaryLine ? `\n\n${boundaryLine}` : ''),
            createdAt: ts,
          })
          .run();
      }
    } else {
      // No book context — seed the assistant's identity so the model knows who
      // it is. Persisted + primed as a conversation turn (see openSession),
      // since the engine-level system prompt alone doesn't reliably steer it.
      db.insert(chatMessages)
        .values({
          id: uuid(),
          sessionId: id,
          role: 'system',
          content: BASE_SYSTEM_PROMPT,
          createdAt: ts,
        })
        .run();
    }

    await get().loadSessions();
    return id;
  },

  async openSession(id) {
    // "Allow for this session" must not leak into the next chat thread.
    useApprovalStore.getState().resetSessionAllowed();

    // Opening a conversation while a reply is still arriving used to leave
    // that reply in flight. Two things went wrong with it. The generation
    // flags carried over, so the chat you opened showed a disabled composer
    // and an activity line describing work being done for the chat you just
    // left. And when the reply finally landed it appended to whatever
    // `messages` was current by then — the answer to a question asked in one
    // chat was pushed into a different chat's transcript, and stayed there
    // until that chat was reopened from the database.
    //
    // The reply was never going to survive this call regardless:
    // `resetConversation` below throws away the engine state it was being
    // generated from. So stopping it is not a new policy, only an honest one.
    // It runs before `activeSession` moves because `stopGeneration` cancels
    // the pending approval for whichever session the store currently names,
    // which has to still be the one being left.
    if (get().isGenerating) {
      get().stopGeneration();
    }

    const session = get().sessions.find((s) => s.id === id) ?? null;
    const rows = db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, id))
      .orderBy(chatMessages.createdAt)
      .all();

    const messages: ChatMessage[] = rows.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      role: r.role as ChatMessage['role'],
      content: r.content,
      createdAt: r.createdAt,
    }));

    set({
      activeSession: session,
      messages,
      streamingContent: '',
      thinkingContent: '',
      thinkingSeconds: null,
      lastStreamedMessageId: null,
      primedGeneration: null,
      // Cleared with the transcript, not left over from the previous chat.
      isGenerating: false,
      isThinking: false,
      isToolCalling: false,
      toolCallStatus: null,
      toolCallName: null,
      // The incoming conversation gets its own assessment below. Keeping the
      // previous chat's context limit here left Switch to chat blocked even
      // after the native conversation had been reset.
      deviceLimit: null,
    });

    // Reset stateful conversation in the engine, once no rename is using it.
    await get().waitForRetitle();
    Inference.resetConversation();

    // Prime the engine with session-specific context (book passage etc.)
    // Send the system message as a user turn so the engine incorporates it
    // into its conversation state. The response is silently discarded.
    const systemMsg = messages.find((m) => m.role === 'system');
    const cloudMode = useSettingsStore.getState().samwellMode === 'cloud';
    if (systemMsg && !cloudMode && Inference.isModelLoaded()) {
      if (!Inference.checkMemoryHeadroom().ok) {
        set({ deviceLimit: 'memory' });
      } else {
        try {
          await seedEngineWithSession();
        } catch (err) {
          if (Inference.isLowMemoryError(err)) set({ deviceLimit: 'memory' });
          else console.warn('[Chat] Context priming failed:', err);
        }
      }
    }
  },

  async sendMessage(content, id) {
    const { activeSession } = get();
    if (!activeSession) return;

    // Captured before the user message is added below — this is only true
    // for the very first turn of a bookless session, which is when a quick
    // AI title is worth generating.
    const isFirstRealMessage = !activeSession.bookId && realMessageCount(get().messages) === 0;

    const { samwellMode, cloudBaseUrl, cloudModelId } = useSettingsStore.getState();
    if (samwellMode === 'offline' && !Inference.isModelLoaded()) return;
    if (samwellMode === 'cloud' && !cloudBaseUrl) return;
    // Grand Maester Samwell runs on accounts, so a turn with nobody behind it
    // has nothing to bill and is not sent. The composer is already disabled
    // and the banner already says why (see `use-samwell-readiness`); this is
    // the floor under both, for anything that reaches here another way.
    if (samwellMode === 'cloud' && useAccountStore.getState().status !== 'signedIn') return;

    const userMsg: ChatMessage = {
      id: id ?? uuid(),
      sessionId: activeSession.id,
      role: 'user',
      content,
      createdAt: now(),
      // Which engine hears it decides whether the journal may ever read it:
      // only cloud turns are sent to be written up (see `chat_messages.via`).
      via: samwellMode === 'cloud' ? 'cloud' : 'device',
    };

    db.insert(chatMessages).values(userMsg).run();
    set((s) => ({
      messages: [...s.messages, userMsg],
      streamingContent: '',
      thinkingContent: '',
      thinkingSeconds: null,
      lastStreamedMessageId: null,
      isGenerating: true,
      isThinking: false, // Start with "Processing…"; SDK empty callback triggers "Thinking…"
      deviceLimit: null,
    }));
    stopRequested = false;

    if (samwellMode === 'cloud') {
      let finalContent = '';
      cloudAbort = new AbortController();
      try {
        const history = get().messages.filter((m) => m.id !== userMsg.id);
        finalContent = await sendCloudChatTurn({
          baseUrl: cloudBaseUrl,
          modelId: cloudModelId,
          sessionId: activeSession.id,
          bookId: activeSession.bookId,
          history,
          content,
          signal: cloudAbort.signal,
          onStreamingContent: (streamed) => {
            set({
              isThinking: false,
              isToolCalling: false,
              toolCallStatus: null, toolCallName: null,
              streamingContent: streamed,
            });
          },
          // The same field the on-device path fills from `result.thinkingText`,
          // so one trace slot serves both engines. Live here rather than at the
          // end, because on cloud the thinking IS the wait.
          onThinkingContent: (trace) => set({ isThinking: true, thinkingContent: trace }),
          // Measured server-side from the first reasoning delta, so the folded
          // "Thought for 3 minutes" row is the wait the reader actually sat
          // through rather than a guess.
          onThinkingDone: (seconds) => set({ thinkingSeconds: seconds }),
          onToolStatus: (status, name) => {
            set(() => ({
              isToolCalling: status !== null,
              toolCallStatus: status,
              toolCallName: name,
              // Thinking pauses while a tool runs. Clearing the flag on the
              // way OUT too turned the gap between a tool finishing and the
              // model thinking again into a false "Processing…" blink —
              // resuming is the reasoning stream's own job.
              //
              // The narration is NOT cleared, and since `assistantTextSinceUser`
              // now joins every assistant message in the turn rather than
              // reading only the last one, the text it holds is a prefix of
              // what arrives next. So the bubble grows through a tool call
              // instead of being replaced by the continuation.
              ...(status !== null ? { isThinking: false } : {}),
            }));
          },
          /*
           * The balance rides in on the stream, so there is no second HTTP
           * call to make. This used to fire a whole authenticated round trip
           * after every message to fetch a number the metered route had
           * already sent in a chunk before it finished.
           */
          onCredits: (available) => {
            useSubscriptionStore.getState().applyCreditsFromTurn(available);
          },
        });
      } catch (err) {
        console.error('[Samwell Cloud] Generation error:', err);
        // Refusals are the server working, not failing, so they get their own
        // sentence. `asCloudRefusal` owns reading the status back out of the
        // transport's message - this used to match on '429' by hand, which is
        // the copy of a decision that drifts.
        const refusal = asCloudRefusal(err);
        const message = err instanceof Error ? err.message : 'Cloud request failed';
        finalContent = refusal ? refusal.message : `Cloud Samwell could not respond: ${message}`;
      } finally {
        cloudAbort = null;
      }

      if (finalContent.length > 0) {
        const assistantMsg: ChatMessage = {
          id: uuid(),
          sessionId: activeSession.id,
          role: 'assistant',
          content: finalContent,
          createdAt: now(),
          via: 'cloud',
        };
        db.insert(chatMessages).values(assistantMsg).run();

        db.update(chatSessions)
          .set({ updatedAt: now() })
          .where(eq(chatSessions.id, activeSession.id))
          .run();

        set((s) => ({
          messages: [...s.messages, assistantMsg],
          streamingContent: '',
          // Already on screen as the streaming bubble — don't let the
          // transcript play its arrival.
          lastStreamedMessageId: assistantMsg.id,
          isThinking: false,
          isToolCalling: false,
          toolCallStatus: null, toolCallName: null,
          isGenerating: false,
        }));
      } else {
        set({ streamingContent: '', isThinking: false, isToolCalling: false, toolCallStatus: null, toolCallName: null, isGenerating: false });
      }

      if (isFirstRealMessage) {
        // Cloud titling is an independent, stateless HTTP call — no shared
        // engine to race, so this doesn't need to block the turn.
        void get().maybeTitleFirstMessage(activeSession.id, content, finalContent);
      }

      await get().loadSessions();
      return;
    }

    // A rename from the history sheet may be running on the same engine.
    // Waited out here, so this turn never shares the engine with it. Its
    // finish invalidates the priming marker, so the check below rebuilds this
    // conversation.
    await get().waitForRetitle();

    // Lazy context priming — if the engine wasn't primed for this session's
    // current native engine (never primed, or the engine was rebuilt since
    // e.g. a WAKE UP reload), prime it with book context before the first message
    if (get().primedGeneration !== Inference.getGeneration()) {
      try {
        // Excludes the turn about to be sent — it is already in `messages`.
        await seedEngineWithSession(userMsg.id);
      } catch (err) {
        console.warn('[Chat] Lazy context priming failed:', err);
        set({ primedGeneration: Inference.getGeneration() });
      }
    }

    const MAX_TOOL_ITERATIONS = 3;
    let finalContent = '';
    // Set instead of attempting a native call we know is unsafe. Left
    // `finalContent` empty deliberately so this falls through the same
    // "nothing to save" path below as an aborted generation already does,
    // rather than needing its own branch.
    let limitReached: DeviceLimit | null = null;
    // Books offered this turn, so a recommendation still renders as a card
    // when the model names one without emitting its marker.
    const suggestedBooks: BookCandidate[] = [];

    try {
      // Turn boundary. The only point where compacting is safe: reseeding the
      // conversation inside the tool loop below would strand a tool call the
      // model is still waiting on a response for.
      if (!Inference.checkMemoryHeadroom().ok) {
        limitReached = 'memory';
      } else {
        const pressure = Inference.assessTurn(content);
        if (pressure === 'full') {
          limitReached = 'context';
        } else if (pressure === 'compact') {
          try {
            await seedEngineWithSession(userMsg.id);
          } catch (err) {
            // Making room is the only thing standing between this turn and a
            // native abort, so a failure here stops the turn rather than
            // pressing on and hoping.
            if (Inference.isLowMemoryError(err)) {
              limitReached = 'memory';
            } else {
              console.warn('[Chat] Context compaction failed:', err);
              limitReached = 'context';
            }
          }
        }
      }

      /*
       * The stream is split as it arrives rather than trusted to be clean.
       *
       * On-device there is one token channel: reasoning and answer come back
       * interleaved, and the engine only reports them separately at the end,
       * and then only for models it was told could reason. A model whose
       * capabilities we read wrong put its whole `<think>` block in the chat
       * bubble. Splitting here is model-agnostic, which is what a catalogue of
       * untested brains needs.
       *
       * The writer keeps the two channels apart the way the cloud path's two
       * callbacks do, so both surfaces move the same way.
       */
      const stream = onDeviceStreamWriter();
      // Whether this model reasons, from what it is, not from the engine flag.
      // Gemma reasons whether the flag is on or off (measured: time to first
      // token was the same either way), so keying the status on the flag left
      // a long reasoning wait labelled "Processing…".
      const reasonsOnDevice = activeModelReasons();
      let result = limitReached
        ? null
        : await Inference.chat(
            content,
            ({ content: c, done }) => {
              /*
               * Empty means nothing for a model that does not reason, and the
               * reasoning itself for one that does (see
               * `thinkingWithoutText`). Either way there is no text to show.
               *
               * Except the final callback, which is always empty. Read as
               * reasoning, a reply that ended without text (the first send
               * after a stop, for one) flashed "Thinking…" on its way out.
               */
              if (!c) {
                if (reasonsOnDevice && !done) stream.thinkingWithoutText();
                return;
              }
              stream.push(c);
            },
          );

      for (let i = 0; result && !limitReached && !stopRequested && i < MAX_TOOL_ITERATIONS && result.toolCalls?.length; i++) {
        if (!Inference.checkMemoryHeadroom().ok) {
          limitReached = 'memory';
          break;
        }
        const toolNames = result.toolCalls.map((tc) => tc.name);
        // What the engine streamed in the same round as the call. Should be
        // empty once automatic tool calling is off in the native module.
        if (__DEV__) console.log('[Chat] Tool round text:', JSON.stringify(result.text.slice(0, 300)));
        // Deletes block on the reader's approval before any work starts,
        // which is a different state from the work itself. Everything else
        // reads from the same table the executor uses, so the indicator can
        // never name a tool other than the one running.
        const statusMsg = toolNames.some((n) => n.startsWith('delete_'))
          ? 'Waiting for delete approval…'
          : toolStatus(toolNames[0]);
        set({
          isToolCalling: true,
          isThinking: false,
          streamingContent: '',
          toolCallStatus: statusMsg,
          toolCallName: toolNames[0] ?? null,
        });

        // Store the assistant's tool-call message (hidden from UI)
        const toolCallMsg: ChatMessage = {
          id: uuid(),
          sessionId: activeSession.id,
          role: 'assistant',
          content: TOOL_CALL_PREFIX + JSON.stringify(result.toolCalls),
          createdAt: now(),
        };
        db.insert(chatMessages).values(toolCallMsg).run();

        // Execute each tool call and collect responses for the engine
        const toolCallCtx: ToolCallContext = {
          sessionId: activeSession.id,
          bookId: activeSession.bookId,
          runtime: 'device',
        };
        const toolResponses: Inference.ToolResponse[] = [];
        // Tokens already spoken for by earlier results in this round, so a turn
        // that calls two tools does not size both against the same room.
        let committedTokens = 0;
        for (const tc of result.toolCalls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.argumentsJson);
          } catch { /* empty */ }

          let toolContent: string;
          if (APPROVAL_REQUIRED_TOOLS.has(tc.name)) {
            const approved = await useApprovalStore
              .getState()
              .requestApproval({ sessionId: activeSession.id, toolName: tc.name, input: args });

            if (!approved) {
              toolContent = JSON.stringify({ approved: false, message: 'User denied this action' });
            } else {
              const { result: toolResult } = await executeToolCall(tc.name, args, toolCallCtx);
              toolContent = JSON.stringify(toolResult);
            }
          } else {
            const { result: toolResult } = await executeToolCall(tc.name, args, toolCallCtx);
            // Format search results with reference markers for the LLM
            // Same prose formatting the cloud path already used. Offline was
            // sending raw JSON, which costs more tokens and reads worse.
            if (tc.name === 'suggest_next_book' && Array.isArray(toolResult)) {
              suggestedBooks.push(...(toolResult as BookCandidate[]));
            }
            // Sized to the room the conversation has left, not only the fixed
            // device ceiling (see `deviceToolResultBudget`). With no useful room
            // it falls back to the ceiling and the fit check below stops the turn.
            const budget = deviceToolResultBudget(
              Inference.remainingContextTokens() - committedTokens,
              estimateTokens(tc.name),
            );
            toolContent = formatToolResultForLLM(
              tc.name,
              toolResult,
              budget ?? TOOL_RESULT_TOKEN_BUDGET.device,
            );
          }

          const toolMsg: ChatMessage = {
            id: uuid(),
            sessionId: activeSession.id,
            role: 'tool',
            content: toolContent,
            createdAt: now(),
          };
          db.insert(chatMessages).values(toolMsg).run();

          toolResponses.push({ name: tc.name, responseJson: toolContent });
          committedTokens += estimateTokens(tc.name + toolContent);
        }

        // Feeding these back is what actually overflows the KV cache, and by
        // here compaction is off the table — so stop instead. The tool ran and
        // its result is saved; the UI explains why Samwell could not summarize it.
        if (!Inference.fitsInContext(toolResponses.map((r) => r.name + r.responseJson).join(''))) {
          limitReached = 'context';
          break;
        }

        // A stop that landed while the tools ran must not start the engine again.
        if (stopRequested) break;

        // Send all tool responses back — engine continues the conversation
        set({ streamingContent: '' });
        result = await Inference.sendToolResponses(
          toolResponses,
          // Same writer as the first turn: a model that reasons does it again
          // after a tool result, and this is the stream that carries it.
          ({ content: c, done }) => {
            if (c) stream.push(c);
            else if (reasonsOnDevice && !done) stream.thinkingWithoutText();
          },
        );
      }

      if (result && !limitReached) {
        // A reply that ran out while still reasoning never crossed back, so the
        // clock is closed here rather than left running into the next turn.
        stream.finish();
        // Whatever the engine did or did not separate, the bubble gets only the
        // answer. `thinkingText` stays authoritative when the engine filled it.
        const split = splitThinking(result.text);
        if (!result.thinkingText && split.thinking) {
          set({ thinkingContent: split.thinking.trim() });
        }
        finalContent = ensureBookMarkers(split.visible.trim(), suggestedBooks);
        // Exhausted MAX_TOOL_ITERATIONS while the model was still mid-tool-call
        // (not mid-answer) — result.text is typically empty here, which would
        // otherwise silently show nothing at all.
        if (!finalContent && result.toolCalls?.length) {
          finalContent = "Samwell got stuck calling tools repeatedly and couldn't finish. Try rephrasing.";
        }
        // Capture thinking text from the final result (available after generation completes)
        if (result.thinkingText) {
          // Trimmed like the streamed path: the engine's own field carries the
          // same newlines the markers were written with.
          set({ thinkingContent: result.thinkingText.trim() });
        }
      }
    } catch (err) {
      if (Inference.isLowMemoryError(err)) {
        // The native module's own memory check refused, after ours had passed.
        // Same wall as the check above, so it gets the same banner.
        limitReached = 'memory';
      } else {
        console.error('[Samwell] Generation error:', err);
      }
      // Aborted or error — use whatever streamed so far
      finalContent = get().streamingContent.trim();
    }

    if (limitReached) {
      if (__DEV__) {
        console.log(
          '[Chat] Device limit:',
          limitReached,
          JSON.stringify(Inference.getContextSnapshot()),
          JSON.stringify(Inference.checkMemoryHeadroom().usage),
        );
      }
      set({ deviceLimit: limitReached });
    }

    if (finalContent.length > 0) {
      const assistantMsg: ChatMessage = {
        id: uuid(),
        sessionId: activeSession.id,
        role: 'assistant',
        content: finalContent,
        createdAt: now(),
      };
      db.insert(chatMessages).values(assistantMsg).run();

      db.update(chatSessions)
        .set({ updatedAt: now() })
        .where(eq(chatSessions.id, activeSession.id))
        .run();

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        streamingContent: '',
        // Already on screen as the streaming bubble — don't let the transcript
        // play its arrival.
        lastStreamedMessageId: assistantMsg.id,
        isThinking: false,
        isToolCalling: false,
        toolCallStatus: null, toolCallName: null,
      }));

      if (isFirstRealMessage) {
        // Offline shares one local engine instance — keep isGenerating true
        // (so the input stays blocked) until this one-shot title call is
        // done, since it also calls resetConversation() and would otherwise
        // race a second message the user sends in the meantime.
        set({ titleRefreshing: true });
        try {
          await get().maybeTitleFirstMessage(activeSession.id, content, finalContent);
        } finally {
          set({ titleRefreshing: false });
        }
      }
      set({ isGenerating: false });
    } else {
      set({ streamingContent: '', isThinking: false, isToolCalling: false, toolCallStatus: null, toolCallName: null, isGenerating: false });
    }

    await get().loadSessions();
  },

  stopGeneration() {
    // On-device: stop the local engine. On cloud: abort the HTTP turn — the
    // stop button used to be inert there, so a cloud reply could not be
    // called off at all.
    stopRequested = true;
    Inference.stopGeneration();
    /*
     * A cancel sticks to the native conversation. Measured on device: after a
     * stop, the next message sent on it was cancelled in 183ms with no output,
     * and every one after it the same. The SDK has no call that clears the
     * cancel, so the conversation is replaced rather than reused. Clearing the
     * priming marker makes the next turn rebuild it from the chat history
     * (`seedEngineWithSession`), which creates a fresh native conversation and
     * keeps the context.
     */
    set({ primedGeneration: null });
    cloudAbort?.abort();
    // A pending approval dialog would otherwise keep waiting for a tap that
    // will never come once generation is stopped. No-op if nothing pending
    // for the currently active session.
    const sessionId = get().activeSession?.id;
    if (sessionId) {
      useApprovalStore.getState().respond(sessionId, false);
    }
  },

  clearDeviceLimit() {
    set({ deviceLimit: null });
  },

  async deleteSession(id) {
    removeSession(id);
    // Any approval still awaiting a response for this session would otherwise
    // leak an unresolved promise once the session it belongs to is gone.
    useApprovalStore.getState().clearSession(id);
    set((s) => ({
      sessions: s.sessions.filter((sess) => sess.id !== id),
      activeSession: s.activeSession?.id === id ? null : s.activeSession,
      messages: s.activeSession?.id === id ? [] : s.messages,
    }));
  },

  async updateSessionTitle(id, title) {
    renameSession(id, title);
    set((s) => ({
      sessions: s.sessions.map((sess) => (sess.id === id ? { ...sess, title } : sess)),
      activeSession:
        s.activeSession?.id === id ? { ...s.activeSession, title } : s.activeSession,
    }));
  },

  async maybeTitleFirstMessage(sessionId, userText, assistantText) {
    try {
      const conversation = assistantText
        ? `User: ${userText}\nSamwell: ${assistantText}`
        : `User: ${userText}`;
      const title = await suggestChatTitle(conversation);
      if (title) {
        await get().updateSessionTitle(sessionId, title);
      }
    } catch (err) {
      // Best-effort — a failed auto-title just leaves "New chat" in place.
      console.warn('[Chat] Could not auto-title session:', err);
    }
  },

  async retitleSession(id) {
    /*
     * Asked for, never offered.
     *
     * A rename used to be raised on the way out of a conversation: a toast
     * asking offline, a silent call on cloud. Leaving is something the reader
     * does all day, and a question every time, whether or not anything had
     * been said since, was noise. The first title still arrives on its own
     * after the opening exchange (`maybeTitleFirstMessage`). Every rename after
     * that is a swipe on the chat's row, so it only happens when wanted.
     */
    if (titleRefineInFlight) throw new RetitleError('Samwell is already renaming a chat.');

    const session = get().sessions.find((s) => s.id === id);
    if (!session) throw new RetitleError('That chat is no longer there.');
    // Book chats are named after their book, which is how they are found.
    if (session.bookId) throw new RetitleError('Chats about a book keep its name.');

    // From the database, not the store: the chat being renamed is usually not
    // the one on screen.
    const conversation = conversationForTitle(readMessages(id));
    if (!conversation) throw new RetitleError('There is nothing in this chat to name it from yet.');

    const onDevice = useSettingsStore.getState().samwellMode !== 'cloud';
    if (onDevice) {
      if (!Inference.isModelLoaded()) {
        throw new RetitleError('Wake Samwell up to rename chats on your device.');
      }
      // On device a title is a generation on the one local engine, and
      // `suggestChatTitle` resets its conversation. Under a reply, that would
      // wipe the conversation the reply is being written into.
      if (get().isGenerating) {
        throw new RetitleError('Samwell is still replying. Try again when he is done.');
      }
      // A device limit means another native generation is the unsafe call it
      // exists to stop.
      if (get().deviceLimit) {
        throw new RetitleError('Samwell cannot rename chats on your device right now.');
      }
    }

    set({ titleRefreshing: true });
    const run = (async () => {
      try {
        const title = await suggestChatTitle(conversation);
        if (!title) throw new Error('No title came back.');
        // The same name back is still an answer to what was asked.
        if (title !== session.title) await get().updateSessionTitle(id, title);
        return title;
      } finally {
        /*
         * `suggestChatTitle` brackets its one-shot prompt with
         * `resetConversation()`, which clears whatever the engine was holding,
         * including the chat on screen. Invalidating the priming marker rather
         * than re-seeding here lets `sendMessage` rebuild that context lazily,
         * on the turn that actually needs it.
         */
        if (onDevice) set({ primedGeneration: null });
        set({ titleRefreshing: false });
        titleRefineInFlight = null;
      }
    })();
    titleRefineInFlight = run;
    titleRefineOnEngine = onDevice;
    return run;
  },

  async waitForRetitle() {
    if (titleRefineInFlight && titleRefineOnEngine) {
      await titleRefineInFlight.catch(() => null);
    }
  },
}));
