import { desc, eq } from 'drizzle-orm';
import { create } from 'zustand';

import { db } from '@/db/client';
import { books, chatMessages, chatSessions } from '@/db/schema';
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
  role: 'system' | 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface ChatStore {
  sessions: ChatSession[];
  activeSession: ChatSession | null;
  messages: ChatMessage[];
  isGenerating: boolean;
  isThinking: boolean;
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
    const historyForLlm = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let result: { content: string; reasoning: string } = { content: '', reasoning: '' };
    try {
      result = await LlamaService.chat(
        historyForLlm,
        ({ content: c, reasoningContent }) => {
          set({
            isThinking: reasoningContent.length > 0 && c.length === 0,
            streamingContent: c,
          });
        },
        _abortController.signal,
      );
    } catch {
      // Aborted or error — use whatever streamed so far
      result = { content: get().streamingContent, reasoning: '' };
    }

    const saveContent = result.content.trim();
    if (saveContent.length > 0) {
      const assistantMsg: ChatMessage = {
        id: uuid(),
        sessionId: activeSession.id,
        role: 'assistant',
        content: saveContent,
        createdAt: now(),
      };
      db.insert(chatMessages).values(assistantMsg).run();

      // Update session updatedAt
      db.update(chatSessions)
        .set({ updatedAt: now() })
        .where(eq(chatSessions.id, activeSession.id))
        .run();

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        streamingContent: '',
        isThinking: false,
        isGenerating: false,
      }));
    } else {
      set({ streamingContent: '', isThinking: false, isGenerating: false });
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
