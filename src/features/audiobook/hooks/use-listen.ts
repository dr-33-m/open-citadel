import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { showToast } from '@/components/toast/toast-provider';
import { paceOf } from '@/features/audiobook/utils/book-clock';
import { bookVoice } from '@/features/audiobook/utils/book-voice';
import { listenInfo, listenPlansLine } from '@/features/audiobook/utils/listen-info';
import { listenEstimate, listenStats } from '@/features/audiobook/utils/listen-estimate';
import { landOnCloud } from '@/features/tts/hooks/use-voice-source';
import { cloudVoiceLabel } from '@/features/tts/utils/cloud-voice-names';
import { createListenFiguresQueryOptions } from '@/query-manager/audiobook';
import { createCloudVoicesQueryOptions } from '@/query-manager/cloud-voices';
import { currentBookVoice, showBook, startBook, type StartResult } from '@/services/audiobook';
import { readHeardVoice, readPace } from '@/services/audiobook/settings';
import type { BookInfo } from '@/services/audiobook/session';
import { useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';
import { parseCloudVoiceKey } from 'samwell-shared';

const TOAST = 'audiobook-listen';

/** What Listen is given: a book from the Library, or a blog post's reader copy (`listenItem`). */
export type ListenTarget = Pick<BookInfo, 'id' | 'title' | 'author' | 'coverUrl'> & { post?: boolean };

const whyNot = (result: StartResult, post: boolean) =>
  result === 'unavailable' ? 'Audio is not available on this phone.' : `This ${post ? 'post' : 'book'} can't be read aloud yet.`;

/**
 * Listen, from a book's menu or a blog post's.
 *
 * With a plan and a book already heard in this voice, it simply plays, and
 * the player opens. The first time (or after the voice has changed) the
 * Listen sheet says what it will cost first: the time left and the Neurons,
 * the voice, and LISTEN. Without a plan that reaches a cloud voice, the plans
 * are sold right here, and buying one opens the Listen sheet.
 */
export function useListen() {
  const router = useRouter();
  const [book, setBook] = React.useState<ListenTarget | null>(null);
  const [open, setOpen] = React.useState(false);
  const [selling, setSelling] = React.useState(false);
  const [choosingVoice, setChoosingVoice] = React.useState(false);
  const [infoOpen, setInfoOpen] = React.useState(false);

  const plan = useSubscriptionStore((s) => (s.status === 'active' ? s.plan : null));
  const stored = useSettingsStore((s) => s.ttsCloudVoice);
  const rate = useSettingsStore((s) => s.ttsRate);
  const figures = useQuery(createCloudVoicesQueryOptions()).data;
  const voice = bookVoice(stored, figures, plan);
  const left = useQuery(createListenFiguresQueryOptions(book?.id ?? '', { enabled: open && book !== null })).data;

  const stats = React.useMemo(() => {
    if (!left || !voice) return null;
    const parsed = parseCloudVoiceKey(voice.key);
    const pace = parsed ? paceOf(readPace(parsed.modelId, parsed.voice)) : paceOf({ chars: 0, sec: 0 });
    return listenStats(listenEstimate({ charsLeft: left.charsLeft, pace, rate, chapterCredits: voice.model?.chapterCredits ?? null }));
  }, [left, voice, rate]);
  const parsed = voice ? parseCloudVoiceKey(voice.key) : null;
  const voiceName = parsed ? [cloudVoiceLabel(parsed.voice), voice?.model?.label].filter(Boolean).join(' · ') : '';

  const begin = React.useCallback(
    async (bookId: string, post: boolean) => {
      // In one moment, the book in the player and the player opening on it: it
      // rises with the book already drawn, its loader on, rather than the mini
      // player arriving first and the player after it.
      const shown = showBook(bookId);
      if (shown) router.push('/podcasts/player');
      const result = await startBook(bookId);
      if (result === 'playing') {
        if (!shown) router.push('/podcasts/player');
      } else if (result === 'no-voice') setSelling(true);
      else showToast({ key: TOAST, message: whyNot(result, post) });
    },
    [router],
  );

  const listen = React.useCallback(
    (next: ListenTarget) => {
      setBook(next);
      const now = currentBookVoice();
      if (!now) setSelling(true);
      else if (readHeardVoice(next.id) !== now.key) setOpen(true);
      else void begin(next.id, next.post ?? false);
    },
    [begin],
  );

  return {
    listen,
    sheet: {
      visible: open,
      onClose: () => setOpen(false),
      book: book ? { title: book.title, author: book.author, coverUrl: book.coverUrl, post: book.post ?? false } : null,
      stats,
      voiceName,
      onVoice: () => setChoosingVoice(true),
      onInfo: () => setInfoOpen(true),
      onListen: () => {
        setOpen(false);
        if (book) void begin(book.id, book.post ?? false);
      },
    },
    voice: { visible: choosingVoice, onClose: () => setChoosingVoice(false) },
    info: { visible: infoOpen, onClose: () => setInfoOpen(false), info: listenInfo(Platform.OS), nested: true },
    plans: {
      visible: selling,
      onClose: () => setSelling(false),
      line: listenPlansLine(book?.post ?? false),
      infoOpensOn: 'voices' as const,
      onActivated: () => {
        const bought = useSubscriptionStore.getState().plan;
        if (bought) landOnCloud(bought);
        setOpen(true);
      },
    },
  };
}

export type ListenState = ReturnType<typeof useListen>;
