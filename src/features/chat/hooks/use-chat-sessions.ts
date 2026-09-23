/**
 * Starting, switching and sending — the three things that touch the engine.
 *
 * All three are guarded by one `switching` flag, and that guard is the reason
 * this is a hook rather than three handlers on a screen. Changing session
 * stops the reply in flight and loads a transcript, and nothing stopped a
 * second tap — another row, "New chat", the book picker — from firing an
 * overlapping switch into the one still running.
 *
 * `switching` doubles as what the history sheet shows a spinner against, so
 * the wait reads as something happening rather than as a stuck sheet.
 */
import React from 'react';

import { NEW_CHAT_TITLE, useChatStore, uuid } from '@/stores/chat';
import { useSamwellSessionStore } from '@/stores/samwell-session';

/** `'new'` for a fresh chat, otherwise the id of the session being opened. */
export type SwitchingTarget = 'new' | string | null;

export function useChatSessions() {
  const isGenerating = useChatStore((s) => s.isGenerating);
  const createSession = useChatStore((s) => s.createSession);
  const openSession = useChatStore((s) => s.openSession);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopGeneration = useChatStore((s) => s.stopGeneration);
  const activeSession = useChatStore((s) => s.activeSession);

  const pendingBook = useSamwellSessionStore((s) => s.pendingBook);
  const setSession = useSamwellSessionStore((s) => s.set);

  const [switching, setSwitching] = React.useState<SwitchingTarget>(null);
  /**
   * The reader's message, shown before the store has it.
   *
   * Carries the id it WILL be committed under, not just its text. That is what
   * lets the transcript render it as the same keyed element the committed one
   * arrives as, so the two reconcile in place instead of one unmounting and
   * another mounting somewhere else.
   */
  const [pendingUserMessage, setPendingUserMessage] = React.useState<{
    id: string;
    content: string;
  } | null>(null);

  const selectSession = React.useCallback(
    async (id: string) => {
      if (switching) return;
      setSwitching(id);
      try {
        if (isGenerating) stopGeneration();
        await openSession(id);
        setSession({ pendingBook: null, mode: 'chat' });
      } finally {
        setSwitching(null);
      }
    },
    [switching, isGenerating, stopGeneration, openSession, setSession],
  );

  const newChat = React.useCallback(async () => {
    if (switching) return;
    setSwitching('new');
    try {
      if (isGenerating) stopGeneration();
      // A rename started from the history sheet may still be generating.
      await useChatStore.getState().waitForRetitle();
      // A new chat makes its own conversation on its first turn. Clear every
      // turn-local field now so a stopped generation cannot leave the page
      // locked while its native promise unwinds.
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
      });
      setSession({ pendingBook: null, mode: 'chat' });
    } finally {
      setSwitching(null);
    }
  }, [switching, isGenerating, stopGeneration, setSession]);

  const send = React.useCallback(
    async (text: string) => {
      /*
       * Minted here, spent below.
       *
       * The first on-device turn of a session rebuilds its history into the
       * model, which is a real wait with the reader's own words not yet
       * anywhere — which is why this optimistic message exists at all. Giving it the id
       * `sendMessage` will commit it under means the transcript can draw one
       * element the whole way through rather than swapping one for another
       * when the store catches up.
       */
      const id = uuid();
      setPendingUserMessage({ id, content: text });
      try {
        if (!activeSession) {
          const sessionId = await createSession({
            bookId: pendingBook?.id,
            title: pendingBook?.title ?? NEW_CHAT_TITLE,
          });
          await openSession(sessionId);
        }
        await sendMessage(text, id);
      } finally {
        setPendingUserMessage(null);
      }
    },
    [activeSession, createSession, openSession, sendMessage, pendingBook],
  );

  return { switching, pendingUserMessage, selectSession, newChat, send };
}
