import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { showToast } from '@/components/toast/toast-provider';
import { paceOf } from '@/features/audiobook/utils/book-clock';
import { bookVoice } from '@/features/audiobook/utils/book-voice';
import { listenInfo } from '@/features/audiobook/utils/listen-info';
import { listenEstimate, listenStats } from '@/features/audiobook/utils/listen-estimate';
import { landOnCloud } from '@/features/tts/hooks/use-voice-source';
import { cloudVoiceLabel } from '@/features/tts/utils/cloud-voice-names';
import { createListenFiguresQueryOptions } from '@/query-manager/audiobook';
import { createCloudVoicesQueryOptions } from '@/query-manager/cloud-voices';
import { currentBookVoice, startBook, type StartResult } from '@/services/audiobook';
import { readHeardVoice, readPace } from '@/services/audiobook/settings';
import type { Book } from '@/stores/books';
import { useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';
import { parseCloudVoiceKey } from 'samwell-shared';

const TOAST = 'audiobook-listen';

const WHY_NOT: Partial<Record<StartResult, string>> = {
  unreadable: "This book can't be read aloud yet.",
  unavailable: 'Audio is not available on this phone.',
};

/**
 * Listen, from a book's menu.
 *
 * With a plan and a book already heard in this voice, it simply plays, and
 * the player opens. The first time (or after the voice has changed) the
 * Listen sheet says what it will cost first: the time left and the Neurons,
 * the voice, and LISTEN. Without a plan that reaches a cloud voice, the plans
 * are sold right here, and buying one opens the Listen sheet.
 */
export function useListen() {
  const router = useRouter();
  const [book, setBook] = React.useState<Book | null>(null);
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
    async (bookId: string) => {
      const result = await startBook(bookId);
      if (result === 'playing') router.push('/podcasts/player');
      else if (result === 'no-voice') setSelling(true);
      else showToast({ key: TOAST, message: WHY_NOT[result] ?? "This book can't be read aloud yet." });
    },
    [router],
  );

  const listen = React.useCallback(
    (next: Book) => {
      setBook(next);
      const now = currentBookVoice();
      if (!now) setSelling(true);
      else if (readHeardVoice(next.id) !== now.key) setOpen(true);
      else void begin(next.id);
    },
    [begin],
  );

  return {
    listen,
    sheet: {
      visible: open,
      onClose: () => setOpen(false),
      book: book ? { title: book.title, author: book.author, coverUrl: book.coverUrl } : null,
      stats,
      voiceName,
      onVoice: () => setChoosingVoice(true),
      onInfo: () => setInfoOpen(true),
      onListen: () => {
        setOpen(false);
        if (book) void begin(book.id);
      },
    },
    voice: { visible: choosingVoice, onClose: () => setChoosingVoice(false) },
    info: { visible: infoOpen, onClose: () => setInfoOpen(false), info: listenInfo(Platform.OS), nested: true },
    plans: {
      visible: selling,
      onClose: () => setSelling(false),
      line: 'Listening to books comes with every plan.',
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
