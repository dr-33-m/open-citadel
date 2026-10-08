/**
 * The cloud voice answering Readium for the open book.
 *
 * One `CloudVoiceSession` per book, made when the first cloud sentence is
 * asked for and put away with the book. Readium's requests and utterances are
 * passed in; audio goes back through `ttsProvideAudioChunk` exactly as the
 * on-device voices' does. The two pieces of state a reader can see come out:
 * whether the voice is still fetching its first words (`working`, drawn on
 * the play button) and a failure being held (`failure`, drawn as a sheet by
 * `use-cloud-voice-failure.ts`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { ReadiumViewRef, TTSSynthesisRequest } from '@dr33m/react-native-readium';

import { cloudChoiceFor } from '@/features/tts/utils/cloud-voices';
import { queryClient } from '@/lib/query-client';
import { billingKeys } from '@/query-manager/billing/keys';
import type { PlanPreview } from '@/services/billing-plans';
import type { CloudVoiceFailure } from '@/services/cloud-tts/request';
import { CloudVoiceSession, type CloudVoiceChoice } from '@/services/cloud-tts/session';
import { useSettingsStore } from '@/stores/settings';

/**
 * How long the sentence already playing may need to finish once the next has
 * failed. Android asks for the next sentence when the last audio is queued,
 * about a second before it is heard (the AudioTrack buffer); iOS asks only
 * once it has finished. Pausing at once would cut a second off the sentence.
 */
const DRAIN_MS = Platform.OS === 'android' ? 1_200 : 0;

export interface HeldFailure {
  request: TTSSynthesisRequest;
  failure: CloudVoiceFailure;
}

/** The voice to ask for now, from what is stored and the catalogue last fetched. */
export function currentCloudChoice(rate: number): CloudVoiceChoice | null {
  const models = queryClient.getQueryData<PlanPreview>(billingKeys.planPreview())?.voices?.models;
  return cloudChoiceFor(useSettingsStore.getState().ttsVoice, models, rate);
}

export function useCloudVoiceBridge(readerRef: React.RefObject<ReadiumViewRef | null>, bookId: string | undefined) {
  const sessionRef = useRef<CloudVoiceSession | null>(null);
  const requestsRef = useRef(new Map<string, TTSSynthesisRequest>());
  const [working, setWorking] = useState(false);
  const [held, setHeld] = useState<HeldFailure | null>(null);

  const session = useCallback((): CloudVoiceSession | null => {
    if (!bookId) return null;
    sessionRef.current ??= new CloudVoiceSession(bookId, {
      provide: (requestId, samples, sampleRate, isLast) => {
        readerRef.current?.ttsProvideAudioChunk(requestId, samples, sampleRate, isLast);
        if (isLast) requestsRef.current.delete(requestId);
      },
      onWaiting: setWorking,
      onFailure: (requestId, failure) => {
        const request = requestsRef.current.get(requestId);
        if (!request) return;
        // Held open, never failed back to Readium: see `session.ts`. The
        // sentence playing is let finish, then the book waits for a choice.
        setTimeout(() => {
          readerRef.current?.ttsPause();
          setHeld({ request, failure });
        }, DRAIN_MS);
      },
    });
    return sessionRef.current;
  }, [bookId, readerRef]);

  // A new book is a new session; the old one's fetches stop with it.
  useEffect(
    () => () => {
      sessionRef.current?.dispose();
      sessionRef.current = null;
      requestsRef.current.clear();
    },
    [bookId],
  );

  const request = useCallback(
    (req: TTSSynthesisRequest) => {
      const choice = currentCloudChoice(req.speed ?? 1);
      const current = session();
      if (!choice || !current) {
        readerRef.current?.ttsSynthesisFailed(req.requestId, 'No cloud voice is chosen.');
        return;
      }
      requestsRef.current.set(req.requestId, req);
      current.request(req.requestId, req.text, choice);
    },
    [readerRef, session],
  );

  const utterance = useCallback(
    (after: string | null | undefined) => {
      const choice = currentCloudChoice(useSettingsStore.getState().ttsRate);
      if (choice) session()?.utterance(after, choice);
    },
    [session],
  );

  const cancel = useCallback((requestId: string) => {
    sessionRef.current?.cancel(requestId);
    requestsRef.current.delete(requestId);
  }, []);

  /** Ask again for the held sentence, in the voice chosen now. */
  const retry = useCallback(() => {
    if (!held) return;
    setHeld(null);
    const choice = currentCloudChoice(held.request.speed ?? 1) ?? undefined;
    sessionRef.current?.retry(held.request.requestId, choice);
    readerRef.current?.ttsResume();
  }, [held, readerRef]);

  /** Let go of the held sentence without answering it here; the caller answers it. */
  const release = useCallback(() => {
    if (!held) return null;
    setHeld(null);
    sessionRef.current?.cancel(held.request.requestId);
    return held.request;
  }, [held]);

  return { request, utterance, cancel, retry, release, working, held };
}
