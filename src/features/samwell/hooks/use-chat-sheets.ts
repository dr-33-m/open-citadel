import React from 'react';

import { useArticlePicker } from '@/features/blogs/hooks/use-article-picker';
import { useChatSessionList } from '@/features/chat/hooks/use-chat-session-list';
import { useChatSessions } from '@/features/chat/hooks/use-chat-sessions';
import { useSwipeRename } from '@/features/chat/hooks/use-swipe-rename';
import { useSamwellAttachment } from '@/features/samwell/hooks/use-samwell-attachment';
import { useEpisodePicker } from '@/features/podcasts/hooks/use-episode-picker';
import type { BookKind } from '@/db/schema';
import { useChatStore, type ChatSession } from '@/stores/chat';
import { useSamwellSessionStore } from '@/stores/samwell-session';
import { useSamwellSheet, useSamwellUiStore } from '@/stores/samwell-ui';

type Picked = { id: string; title: string; kind: BookKind };

/**
 * What a pick does: held until the first message makes it a chat. Picked in a
 * chat already under way (one holding nothing, see `attachmentTool`), it
 * starts a new chat about it first, since what a chat holds is fixed once it
 * has begun.
 */
function usePick() {
  const setSession = useSamwellSessionStore((s) => s.set);
  const { newChat } = useChatSessions();
  return React.useCallback(
    async (picked: Picked) => {
      if (useChatStore.getState().activeSession) await newChat();
      setSession({ pendingBook: picked });
    },
    [setSession, newChat],
  );
}

/** A book to talk about. */
export function useBookPickerSheet() {
  const { visible, onClose } = useSamwellSheet('book');
  const pick = usePick();
  const onSelect = React.useCallback(
    (id: string, title: string) => {
      onClose();
      void pick({ id, title, kind: 'book' });
    },
    [pick, onClose],
  );
  return { visible, onSelect, onClose };
}

export function useArticlePickerSheet() {
  const { visible, onClose } = useSamwellSheet('post');
  return useArticlePicker(visible, onClose, usePick());
}

export function useEpisodePickerSheet() {
  const { visible, onClose } = useSamwellSheet('episode');
  return useEpisodePicker(visible, onClose, usePick());
}

/**
 * Every conversation with Samwell, to go back into, rename or delete: the
 * Compass conversations from before the merge among them, each opening in the
 * one transcript.
 */
export function useChatHistorySheet() {
  const { visible, onClose } = useSamwellSheet('history');
  const sessions = useChatSessionList('reading');
  const switching = useSamwellUiStore((s) => s.chatSwitching);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const rename = useSwipeRename(useChatStore((s) => s.retitleSession), 'Could not rename this chat. Try again.');
  const { selectSession, newChat } = useChatSessions();

  const onSelect = React.useCallback(
    (id: string) => {
      onClose();
      void selectSession(id);
    },
    [onClose, selectSession],
  );
  const onNewChat = React.useCallback(() => {
    onClose();
    void newChat();
  }, [onClose, newChat]);
  // The swipe's reach point is the confirmation, so the chat goes at once and
  // the sheet stays open with the list closing the gap.
  const onDelete = React.useCallback((session: ChatSession) => void deleteSession(session.id), [deleteSession]);

  return { visible, sessions, switching, renamingId: rename.renamingId, onRename: rename.rename, onSelect, onNewChat, onDelete, onClose };
}

/** An episode chat's transcript, opened from the header's badge. */
export function useEpisodeTranscriptSheet() {
  const { visible, onClose } = useSamwellSheet('episode-transcript');
  const { episode } = useSamwellAttachment();
  return { episodeId: episode?.episodeId ?? null, visible: visible && episode != null, onClose, line: episode?.line ?? '' };
}
