import { desc, eq } from 'drizzle-orm';
import { create } from 'zustand';

import { db } from '@/db/client';
import { books, chatMessages, chatSessions, readingProgress } from '@/db/schema';
import { extractChapterTextToLocator } from '@/services/book-context';
import { buildJourneySnapshot } from '@/services/journey';
import {
  APPROVAL_REQUIRED_TOOLS,
  executeToolCall,
  formatSearchResultsForLLM,
  type SearchResult,
} from '@/services/chat-tools';
import { sendCloudChatTurn } from '@/services/cloud-chat';
import * as Inference from '@/services/inference';
import { useApprovalStore } from '@/stores/approval';
import { useModelStore } from '@/stores/model';
import { useSettingsStore } from '@/stores/settings';

export interface ChatSession {
  id: string;
  bookId: string | null;
  bookTitle: string | null;
  title: string;
  contextText: string | null;
  contextLocator: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessage: string | null;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  createdAt: string;
}

interface ChatStore {
  sessions: ChatSession[];
  activeSession: ChatSession | null;
  messages: ChatMessage[];
  isGenerating: boolean;
  isThinking: boolean;
  isToolCalling: boolean;
  toolCallStatus: string | null;
  streamingContent: string;
  thinkingContent: string;
  contextPrimed: boolean;

  loadSessions(): Promise<void>;
  createSession(opts: {
    bookId?: string;
    title: string;
    contextText?: string;
    contextLocator?: string;
  }): Promise<string>;
  openSession(id: string): Promise<void>;
  sendMessage(content: string): Promise<void>;
  stopGeneration(): void;
  deleteSession(id: string): Promise<void>;
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

// The user's journey (finished books, recurring themes, goal history) synthesized
// on-device. Only this compact slice travels with a cloud request the user is
// already making; the full history never leaves the device.
function journeyBlock(): string {
  try {
    const snapshot = buildJourneySnapshot();
    return snapshot
      ? `\n\nThe user's journey so far (use it to give continuity and to ground what you suggest; never assume beyond it):\n${snapshot}`
      : '';
  } catch {
    return '';
  }
}

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function now(): string {
  return new Date().toISOString();
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  activeSession: null,
  messages: [],
  isGenerating: false,
  isThinking: false,
  isToolCalling: false,
  toolCallStatus: null,
  streamingContent: '',
  thinkingContent: '',
  contextPrimed: false,

  async loadSessions() {
    const rows = db
      .select({
        id: chatSessions.id,
        bookId: chatSessions.bookId,
        bookTitle: books.title,
        title: chatSessions.title,
        contextText: chatSessions.contextText,
        contextLocator: chatSessions.contextLocator,
        createdAt: chatSessions.createdAt,
        updatedAt: chatSessions.updatedAt,
      })
      .from(chatSessions)
      .leftJoin(books, eq(chatSessions.bookId, books.id))
      .orderBy(desc(chatSessions.updatedAt))
      .all();

    // Fetch last user/assistant message per session
    const sessions: ChatSession[] = await Promise.all(
      rows.map(async (row) => {
        const lastMsg = db
          .select({ content: chatMessages.content, role: chatMessages.role })
          .from(chatMessages)
          .where(eq(chatMessages.sessionId, row.id))
          .orderBy(desc(chatMessages.createdAt))
          .limit(1)
          .all();

        const visible = lastMsg.find((m) => m.role !== 'system');
        return {
          id: row.id,
          bookId: row.bookId ?? null,
          bookTitle: row.bookTitle ?? null,
          title: row.title,
          contextText: row.contextText ?? null,
          contextLocator: row.contextLocator ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          lastMessage: visible?.content.slice(0, 80) ?? null,
        };
      }),
    );

    set({ sessions });
  },

  async createSession({ bookId, title, contextText, contextLocator }) {
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
          }. Hard rule: never reveal, discuss, or hint at plot events, characters, or ideas that appear beyond that point — not from the book text and not from your own knowledge of the book. If asked about later content, say you will discuss it once they have read that far.`
        : null;

    db.insert(chatSessions)
      .values({
        id,
        bookId: bookId ?? null,
        title,
        contextText: contextText ?? null,
        contextLocator: contextLocator ?? null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    // Persist the system message so history is always complete when reloading
    if (contextText) {
      const bookRow = bookId
        ? db.select({ title: books.title, author: books.author }).from(books).where(eq(books.id, bookId)).get()
        : null;

      const bookLine = bookRow
        ? `You are discussing "${bookRow.title}" by ${bookRow.author}. `
        : '';

      const systemContent =
        `${bookLine}The user is reading the following passage:\n\n${contextText}\n\n` +
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
              (boundaryLine ? `\n\n${boundaryLine}` : '') +
              journeyBlock(),
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
          content: BASE_SYSTEM_PROMPT + journeyBlock(),
          createdAt: ts,
        })
        .run();
    }

    await get().loadSessions();
    return id;
  },

  async openSession(id) {
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

    set({ activeSession: session, messages, streamingContent: '', thinkingContent: '', contextPrimed: false });

    // Reset stateful conversation in the engine
    Inference.resetConversation();

    // Prime the engine with session-specific context (book passage etc.)
    // Send the system message as a user turn so the engine incorporates it
    // into its conversation state. The response is silently discarded.
    const systemMsg = messages.find((m) => m.role === 'system');
    const cloudMode = useSettingsStore.getState().samwellMode === 'cloud';
    if (systemMsg && !cloudMode && Inference.isModelLoaded()) {
      try {
        console.log('[Chat] Priming engine with system context:', systemMsg.content.slice(0, 100) + '...');
        await Inference.chat(
          systemMsg.content + '\n\nAcknowledge this context with "OK".',
          () => {},
        );
        set({ contextPrimed: true });
        console.log('[Chat] Context priming complete');
      } catch (err) {
        console.warn('[Chat] Context priming failed:', err);
      }
    }
  },

  async sendMessage(content) {
    const { activeSession } = get();
    if (!activeSession) return;

    const {
      samwellMode,
      cloudBaseUrl,
      cloudModelId,
      getCloudDeviceId,
      loadCloudUsage,
    } = useSettingsStore.getState();
    const { enableToolCalling, enableThinking } = useModelStore.getState().inference;
    if (samwellMode === 'offline' && !Inference.isModelLoaded()) return;
    if (samwellMode === 'cloud' && !cloudBaseUrl) return;

    const userMsg: ChatMessage = {
      id: uuid(),
      sessionId: activeSession.id,
      role: 'user',
      content,
      createdAt: now(),
    };

    db.insert(chatMessages).values(userMsg).run();
    set((s) => ({
      messages: [...s.messages, userMsg],
      streamingContent: '',
      thinkingContent: '',
      isGenerating: true,
      isThinking: false, // Start with "Processing…"; SDK empty callback triggers "Thinking…"
    }));

    if (samwellMode === 'cloud') {
      let finalContent = '';
      try {
        const history = get().messages.filter((m) => m.id !== userMsg.id);
        const deviceId = await getCloudDeviceId();
        finalContent = await sendCloudChatTurn({
          baseUrl: cloudBaseUrl,
          deviceId,
          modelId: cloudModelId,
          sessionId: activeSession.id,
          history,
          content,
          onStreamingContent: (streamed) => {
            set({
              isThinking: false,
              isToolCalling: false,
              toolCallStatus: null,
              streamingContent: streamed,
            });
          },
          onToolStatus: (status) => {
            set({
              isToolCalling: status !== null,
              toolCallStatus: status,
              isThinking: false,
            });
          },
        });
        await loadCloudUsage();
      } catch (err) {
        console.error('[Samwell Cloud] Generation error:', err);
        const message = err instanceof Error ? err.message : 'Cloud request failed';
        finalContent = message.includes('429')
          ? 'Cloud Samwell has reached the current usage limit. Try again after the reset window.'
          : `Cloud Samwell could not respond: ${message}`;
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
          isThinking: false,
          isToolCalling: false,
          toolCallStatus: null,
          isGenerating: false,
        }));
      } else {
        set({ streamingContent: '', isThinking: false, isToolCalling: false, toolCallStatus: null, isGenerating: false });
      }

      await get().loadSessions();
      return;
    }

    // Lazy context priming — if the model wasn't loaded when the session
    // was opened, prime the engine with book context before the first message
    if (!get().contextPrimed) {
      const systemMsg = get().messages.find((m) => m.role === 'system');
      if (systemMsg) {
        try {
          console.log('[Chat] Lazy-priming engine with system context');
          await Inference.chat(
            systemMsg.content + '\n\nAcknowledge this context with "OK".',
            () => {},
          );
          set({ contextPrimed: true });
        } catch (err) {
          console.warn('[Chat] Lazy context priming failed:', err);
        }
      } else {
        set({ contextPrimed: true });
      }
    }

    const MAX_TOOL_ITERATIONS = 3;
    let finalContent = '';

    try {
      // When tools are enabled, suppress first-pass display — the model may emit
      // "I can't find..." text before triggering tool calls (example app pattern).
      // When tools are off, stream normally.
      let result = await Inference.chat(
        content,
        enableToolCalling
          ? () => {} // suppress first-pass tokens; "Processing" indicator shows instead
          : ({ content: c }) => {
              if (c) {
                set({ isThinking: false, streamingContent: c });
              } else if (enableThinking) {
                // Empty callback = model transitioned from prefill to thinking
                set({ isThinking: true });
              }
            },
      );

      // If tools were suppressed but model answered without calling tools,
      // show the response text now
      if (enableToolCalling && !result.toolCalls?.length) {
        set({ isThinking: false, streamingContent: result.text });
      }

      for (let i = 0; i < MAX_TOOL_ITERATIONS && result.toolCalls?.length; i++) {
        const toolNames = result.toolCalls.map((tc) => tc.name);
        const statusMsg = toolNames.some((n) => n.startsWith('delete_'))
          ? 'Waiting for delete approval…'
          : toolNames.some((n) => n.startsWith('tag_'))
            ? 'Organizing your tags…'
            : toolNames.includes('search_thoughts')
              ? 'Searching through your thoughts…'
              : 'Searching through your highlights…';
        set({ isToolCalling: true, isThinking: false, streamingContent: '', toolCallStatus: statusMsg });

        // Store the assistant's tool-call message (hidden from UI)
        const toolCallMsg: ChatMessage = {
          id: uuid(),
          sessionId: activeSession.id,
          role: 'assistant',
          content: '\0TOOL_CALL\0' + JSON.stringify(result.toolCalls),
          createdAt: now(),
        };
        db.insert(chatMessages).values(toolCallMsg).run();

        // Execute each tool call and collect responses for the engine
        const toolResponses: Inference.ToolResponse[] = [];
        for (const tc of result.toolCalls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.argumentsJson);
          } catch { /* empty */ }

          let toolContent: string;
          if (APPROVAL_REQUIRED_TOOLS.has(tc.name)) {
            const approved = await useApprovalStore
              .getState()
              .requestApproval({ toolName: tc.name, input: args });

            if (!approved) {
              toolContent = JSON.stringify({ approved: false, message: 'User denied this action' });
            } else {
              const { result: toolResult } = await executeToolCall(tc.name, args);
              toolContent = JSON.stringify(toolResult);
            }
          } else {
            const { result: toolResult } = await executeToolCall(tc.name, args);
            // Format search results with reference markers for the LLM
            toolContent = (tc.name === 'search_highlights' || tc.name === 'search_thoughts') && Array.isArray(toolResult)
              ? formatSearchResultsForLLM(toolResult as SearchResult[])
              : JSON.stringify(toolResult);
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
        }

        // Send all tool responses back — engine continues the conversation
        set({ streamingContent: '' });
        result = await Inference.sendToolResponses(
          toolResponses,
          ({ content: c }) => {
            set({ isToolCalling: false, toolCallStatus: null, streamingContent: c });
          },
        );
      }

      finalContent = result.text.trim();
      // Capture thinking text from the final result (available after generation completes)
      if (result.thinkingText) {
        set({ thinkingContent: result.thinkingText });
      }
    } catch (err) {
      console.error('[Samwell] Generation error:', err);
      // Aborted or error — use whatever streamed so far
      finalContent = get().streamingContent.trim();
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
        isThinking: false,
        isToolCalling: false,
        toolCallStatus: null,
        isGenerating: false,
      }));
    } else {
      set({ streamingContent: '', isThinking: false, isToolCalling: false, toolCallStatus: null, isGenerating: false });
    }

    await get().loadSessions();
  },

  stopGeneration() {
    Inference.stopGeneration();
  },

  async deleteSession(id) {
    db.delete(chatMessages).where(eq(chatMessages.sessionId, id)).run();
    db.delete(chatSessions).where(eq(chatSessions.id, id)).run();
    set((s) => ({
      sessions: s.sessions.filter((sess) => sess.id !== id),
      activeSession: s.activeSession?.id === id ? null : s.activeSession,
      messages: s.activeSession?.id === id ? [] : s.messages,
    }));
  },
}));
