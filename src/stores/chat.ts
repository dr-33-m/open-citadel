import { desc, eq } from 'drizzle-orm';
import { create } from 'zustand';

import { db } from '@/db/client';
import { books, chatMessages, chatSessions } from '@/db/schema';
import {
  SAMWELL_TOOLS,
  executeToolCall,
  formatSearchResultsForLLM,
  type SearchResult,
} from '@/services/chat-tools';
import * as LlamaService from '@/services/llama-service';

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

let _abortController: AbortController | null = null;

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

    set({ activeSession: session, messages, streamingContent: '' });
    await LlamaService.clearCache();
  },

  async sendMessage(content) {
    const { activeSession, messages } = get();
    if (!activeSession) return;
    if (!LlamaService.isModelLoaded()) return;

    const userMsg: ChatMessage = {
      id: uuid(),
      sessionId: activeSession.id,
      role: 'user',
      content,
      createdAt: now(),
    };

    db.insert(chatMessages).values(userMsg).run();
    set((s) => ({ messages: [...s.messages, userMsg], streamingContent: '', isGenerating: true }));

    _abortController = new AbortController();

    // Build messages array for the LLM (system + full history + new user msg)
    type LlmMessage = {
      role: string;
      content: string;
      tool_calls?: LlamaService.ToolCall[];
      tool_call_id?: string;
      name?: string;
    };
    const historyForLlm: LlmMessage[] = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const MAX_TOOL_ITERATIONS = 3;
    let finalContent = '';

    try {
      for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        set({ streamingContent: '' });

        // Clear KV cache before each completion so the new message history is processed fresh
        if (i > 0) await LlamaService.clearCache();

        const result = await LlamaService.chat(
          historyForLlm,
          ({ content: c, reasoningContent }) => {
            set({
              isThinking: reasoningContent.length > 0 && c.length === 0,
              isToolCalling: false,
              toolCallStatus: null,
              streamingContent: c,
            });
          },
          _abortController!.signal,
          { tools: SAMWELL_TOOLS },
        );

        // If the model made tool calls, execute them and loop
        if (result.tool_calls?.length) {
          const toolNames = result.tool_calls!.map((tc) => tc.function.name);
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
            content: '\0TOOL_CALL\0' + JSON.stringify(result.tool_calls),
            createdAt: now(),
          };
          db.insert(chatMessages).values(toolCallMsg).run();
          historyForLlm.push({
            role: 'assistant',
            content: result.content || '',
            tool_calls: result.tool_calls,
          });

          // Ensure every tool call has an id (some models omit it)
          for (const tc of result.tool_calls) {
            if (!tc.id) tc.id = `call_${uuid()}`;
          }

          // Execute each tool call and feed results back
          for (const tc of result.tool_calls) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.function.arguments);
            } catch { /* empty */ }

            const { result: toolResult } = await executeToolCall(tc.function.name, args);

            // Format search results with reference markers for the LLM
            let toolContent: string;
            if ((tc.function.name === 'search_highlights' || tc.function.name === 'search_thoughts') && Array.isArray(toolResult)) {
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
            historyForLlm.push({
              role: 'tool',
              content: toolContent,
              tool_call_id: tc.id!,
              name: tc.function.name,
            });
          }

          // Keep isToolCalling true — toolCallStatus stays as-is until the LLM starts streaming
          continue;
        }

        // No tool calls — this is the final response
        finalContent = result.content.trim();
        break;
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

    _abortController = null;
    await get().loadSessions();
  },

  stopGeneration() {
    _abortController?.abort();
    _abortController = null;
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
