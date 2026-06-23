import { desc, eq } from 'drizzle-orm';
import { create } from 'zustand';

import { db } from '@/db/client';
import { books, chatMessages, chatSessions } from '@/db/schema';
import {
  executeToolCall,
  formatSearchResultsForLLM,
  type SearchResult,
} from '@/services/chat-tools';
import * as Inference from '@/services/inference';
import { useModelStore } from '@/stores/model';

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
        'Answer questions about it, provide analysis, and discuss themes. Be concise and insightful.';

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
        .select({ title: books.title, author: books.author })
        .from(books)
        .where(eq(books.id, bookId))
        .get();

      if (bookRow) {
        db.insert(chatMessages)
          .values({
            id: uuid(),
            sessionId: id,
            role: 'system',
            content: `You are a reading assistant for "${bookRow.title}" by ${bookRow.author}. Help the user understand, analyse, and discuss the book. Be concise and insightful.`,
            createdAt: ts,
          })
          .run();
      }
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
    if (systemMsg && Inference.isModelLoaded()) {
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
    if (!Inference.isModelLoaded()) return;

    const { enableToolCalling, enableThinking } = useModelStore.getState().inference;

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
        const statusMsg = toolNames.some((n) => n.startsWith('tag_'))
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

          const { result: toolResult } = await executeToolCall(tc.name, args);

          // Format search results with reference markers for the LLM
          let toolContent: string;
          if ((tc.name === 'search_highlights' || tc.name === 'search_thoughts') && Array.isArray(toolResult)) {
            toolContent = formatSearchResultsForLLM(toolResult as SearchResult[]);
          } else {
            toolContent = JSON.stringify(toolResult);
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
