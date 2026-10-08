/**
 * Answers Readium's native TTS engine when it asks for a voice.
 *
 * Readium still owns everything else — walking the EPUB, locators,
 * pause/resume/skip, page-turn-on-crossing. The native `KokoroTTSEngine`
 * (iOS) / `KokoroTtsEngine` (Android) it speaks through has nothing to
 * synthesize with on its own, since Kokoro's model runs in
 * `react-native-executorch`'s JS layer — so it asks JS for each utterance's
 * audio via `onTTSSynthesisRequest` and this hook answers with
 * `ttsProvideAudioChunk` calls, one per streamed chunk.
 *
 * Supertonic speaks through the same native engine, which only knows Kokoro's
 * voice ids: the reader starts it with no voice (`readerVoiceId`), and the
 * voice to speak in is read from settings here instead.
 */
import { useCallback } from 'react';

import type { ReadiumViewRef, TTSSynthesisRequest } from '@dr33m/react-native-readium';
import { KOKORO_SAMPLE_RATE } from 'react-native-executorch';

import { isAiVoice, resolveVoice } from '@/services/device-tts/catalogue';
import { useSettingsStore } from '@/stores/settings';
import { stop as stopSynthesis, synthesize } from '@/services/device-tts/engine';

/** The exact bytes of a chunk's audio, regardless of how its Float32Array views its buffer. */
function chunkBytes(audio: Float32Array): ArrayBuffer {
  // Never actually backed by a SharedArrayBuffer here — it's native PCM handed
  // across the JSI bridge — so the union type this lib version gives `.slice`
  // is wider than reality.
  return audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer;
}

export function useKokoroTtsBridge(readerRef: React.RefObject<ReadiumViewRef | null>) {
  const onSynthesisRequest = useCallback(
    (request: TTSSynthesisRequest) => {
      void (async () => {
        // The saved voice when it is one of ours: the native side may have
        // been started with none (a Supertonic voice, or a cloud voice the
        // reader has just come back to the phone from), and its own idea of
        // the voice would then be Kokoro's default rather than the choice.
        const chosen = useSettingsStore.getState().ttsVoice;
        const voice = isAiVoice(chosen) ? chosen : resolveVoice(request.voice);
        // One retry, and only when nothing has been sent yet. A book left
        // reading unattended hits an occasional utterance that throws before
        // its first chunk — nothing this bridge does explains why, and
        // Readium's own navigator has no recovery for it: the book just stops,
        // silently, until something nudges playback again. Once real chunks
        // are already on the wire, retrying would resend them under the same
        // requestId and the native side has no notion of "replace what you
        // already wrote" — it only ever appends, so that duplicates audio
        // instead of fixing anything.
        for (let attempt = 0; attempt < 2; attempt++) {
          let sentAny = false;
          try {
            for await (const chunk of synthesize(request.text, { voice, speed: request.speed })) {
              sentAny = true;
              const isLast = chunk.chunkIndex === chunk.totalChunks - 1;
              readerRef.current?.ttsProvideAudioChunk(request.requestId, chunkBytes(chunk.audio), chunk.sampleRate, isLast);
            }
            // An empty utterance yields no chunks — still answer, so the native
            // engine's `speak` isn't left waiting on a chunk that never comes.
            if (!sentAny) {
              readerRef.current?.ttsProvideAudioChunk(request.requestId, new ArrayBuffer(0), KOKORO_SAMPLE_RATE, true);
            }
            return;
          } catch (err) {
            if (sentAny || attempt === 1) {
              const message = err instanceof Error ? err.message : 'Speech synthesis failed';
              readerRef.current?.ttsSynthesisFailed(request.requestId, message);
              return;
            }
          }
        }
      })();
    },
    [readerRef],
  );

  const onSynthesisCancel = useCallback(() => {
    stopSynthesis();
  }, []);

  return { onSynthesisRequest, onSynthesisCancel };
}
