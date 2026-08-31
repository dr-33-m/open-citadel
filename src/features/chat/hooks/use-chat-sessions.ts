/**
 * Starting, switching and sending — the three things that touch the engine.
 *
 * All three are guarded by one `switching` flag, and that guard is the reason
 * this is a hook rather than three handlers on a screen. Changing session does
 * slow engine work at both ends: re-titling the conversation being left, then
 * priming the incoming one with its book context. On a slow device that is a
 * real wait, and nothing stopped a second tap — another row, "New chat", the
 * book picker — from firing an overlapping call into the engine mid-switch,
 * which is the concurrent-access crash class this app has hit before.
 *
 * `switching` doubles as what the history sheet shows a spinner against, so
 * the wait reads as something happening rather than as a stuck sheet.
 */
import React from 'react';

import { useChatStore } from '@/stores/chat';
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
  const [pendingUserMessage, setPendingUserMessage] = React.useState<string | null>(null);

  const selectSession = React.useCallback(
    async (id: string) => {
      if (switching) return;
      setSwitching(id);
      try {
        if (isGenerating) stopGeneration();
        // The session being *left* is what needs a last chance at a better
        // title from its full transcript, so this runs before the open.
        await useChatStore.getState().refineSessionTitleOnExit();
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
      await useChatStore.getState().refineSessionTitleOnExit();
      useChatStore.setState({ activeSession: null, messages: [] });
      setSession({ pendingBook: null, mode: 'chat' });
    } finally {
      setSwitching(null);
    }
  }, [switching, isGenerating, stopGeneration, setSession]);

  const send = React.useCallback(
    async (text: string) => {
      setPendingUserMessage(text);
      try {
        if (!activeSession) {
          const sessionId = await createSession({
            bookId: pendingBook?.id,
            title: pendingBook?.title ?? 'New chat',
          });
          await openSession(sessionId);
        }
        await sendMessage(text);
      } finally {
        setPendingUserMessage(null);
      }
    },
    [activeSession, createSession, openSession, sendMessage, pendingBook],
  );

  return { switching, pendingUserMessage, selectSession, newChat, send };
}
