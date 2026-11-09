/**
 * Starting, switching and sending — the three things that touch the engine.
 *
 * All three are guarded by one `chatSwitching` flag, and that guard is the
 * reason these are not three handlers on a screen. Changing session stops the
 * reply in flight and loads a transcript, and nothing stopped a second tap —
 * another row, "New chat", the book picker — from firing an overlapping
 * switch into the one still running.
 *
 * Actions only, with no subscriptions: each reads the stores when it runs, so
 * any part of the Samwell page can hold them without redrawing when a turn or
 * a switch moves on. The flag and the reader's message waiting for the store
 * live in `useSamwellUiStore`, where the parts that draw them subscribe.
 */
import React from 'react';

import { leaveForNewChat } from '@/services/samwell-handoff';
import { NEW_CHAT_TITLE, useChatStore, uuid } from '@/stores/chat';
import { useSamwellSessionStore } from '@/stores/samwell-session';
import { useSamwellUiStore, type SwitchingTarget } from '@/stores/samwell-ui';

export type { SwitchingTarget };

const ui = () => useSamwellUiStore.getState();

async function selectSession(id: string): Promise<void> {
  if (ui().chatSwitching) return;
  ui().set({ chatSwitching: id });
  try {
    const chat = useChatStore.getState();
    if (chat.isGenerating) chat.stopGeneration();
    await chat.openSession(id);
    useSamwellSessionStore.getState().set({ pendingBook: null });
  } finally {
    ui().set({ chatSwitching: null });
  }
}

async function newChat(): Promise<void> {
  if (ui().chatSwitching) return;
  ui().set({ chatSwitching: 'new' });
  try {
    // A new chat makes its own conversation on its first turn.
    await leaveForNewChat();
    useSamwellSessionStore.getState().set({ pendingBook: null });
  } finally {
    ui().set({ chatSwitching: null });
  }
}

async function send(text: string): Promise<void> {
  /*
   * Minted here, spent below.
   *
   * The first on-device turn of a session rebuilds its history into the
   * model, which is a real wait with the reader's own words not yet anywhere,
   * which is why this optimistic message exists at all. Giving it the id
   * `sendMessage` will commit it under means the transcript can draw one
   * element the whole way through rather than swapping one for another when
   * the store catches up.
   */
  const id = uuid();
  ui().set({ pendingUserMessage: { id, content: text } });
  try {
    const chat = useChatStore.getState();
    if (!chat.activeSession) {
      const { pendingBook } = useSamwellSessionStore.getState();
      const sessionId = await chat.createSession({
        bookId: pendingBook?.id,
        title: pendingBook?.title ?? NEW_CHAT_TITLE,
      });
      await useChatStore.getState().openSession(sessionId);
    }
    await useChatStore.getState().sendMessage(text, id);
  } finally {
    ui().set({ pendingUserMessage: null });
  }
}

function resend(id: string): void {
  void useChatStore.getState().resendMessage(id);
}

const ACTIONS = { selectSession, newChat, send, resend };

/** The chat's three engine actions, stable for the life of the app. */
export function useChatSessions(): typeof ACTIONS {
  return React.useMemo(() => ACTIONS, []);
}
