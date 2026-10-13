/**
 * The one loaded voice pipeline, held for as long as the reader might want
 * a voice — a singleton so repeated reading sessions never pay to reload it.
 *
 * "One" is deliberate: each Kokoro accent needs its own phonemizer, hence its
 * own pipeline, and Supertonic and Paradee are two more, but two FP32
 * pipelines would double the memory that already exhausts a 2 GB phone. So
 * the loaded pipeline is swapped when a voice of another accent or engine is
 * asked for. That swap happens inside the synthesis queue, so it can never
 * dispose a pipeline that is mid-utterance.
 *
 * This is a much thinner singleton than `device-llm/engine.ts`'s: Kokoro has
 * no per-conversation cache to share, so the only hazard is calling
 * `synthesize` twice at once, which `exclusive` alone covers. What is
 * deliberately NOT shared here is any notion of an active reading session —
 * which sentence is playing, where it paused — because on both the LLM and
 * TTS side, that state belongs to whatever is using the engine, not to it.
 */

import type { KokoroTextToSpeech, SupertonicTextToSpeech } from 'react-native-executorch';

import { getExecuTorch } from '@/lib/executorch';
import {
  engineOf,
  isKokoroVoice,
  resolveVoice,
  VOICE_ACCENTS,
  type AiVoice,
  type KokoroAccent,
  type TtsEngineId,
} from '@/services/device-tts/catalogue';
import { localKokoroFiles, localParadeeFiles, localSupertonicFiles } from '@/services/device-tts/files';
import { atBestSteps, supertonicParts, supertonicSteps } from '@/services/device-tts/lead';
import {
  KOKORO_CHUNKS,
  createPaceMeter,
  pacedSynthesis,
  type PaceMeter,
  type SpeechChunk,
  type UtteranceTiming,
} from '@/services/device-tts/pace';
import { isSupertonicVoice, supertonicSpeed, supertonicStyle } from '@/services/device-tts/supertonic';

/**
 * Which pipeline is loaded: Supertonic's one, Paradee's one, or one of
 * Kokoro's per accent. Paradee's is a Kokoro pipeline over its own files.
 */
type Loaded =
  | { kind: 'kokoro'; accent: KokoroAccent; pipeline: KokoroTextToSpeech<string> }
  | { kind: 'paradee'; pipeline: KokoroTextToSpeech<string> }
  | { kind: 'supertonic'; pipeline: SupertonicTextToSpeech<string> };

/** What `load` is asked for: a `Loaded` before it has a pipeline. */
type Wanted = { kind: 'kokoro'; accent: KokoroAccent } | { kind: 'paradee' } | { kind: 'supertonic' };

/** The pipeline a voice is spoken through. */
function wantedFor(voice: AiVoice): Wanted {
  if (isKokoroVoice(voice)) return { kind: 'kokoro', accent: VOICE_ACCENTS[voice] };
  return { kind: engineOf(voice) === 'paradee' ? 'paradee' : 'supertonic' };
}

let engine: Loaded | null = null;
/**
 * Tail of the queue a `synthesize` call waits its turn on.
 *
 * Not `createExclusiveQueue`: that factory serializes a function's whole
 * *invocation*, but the work here worth serializing is a generator's whole
 * *drain* — from the caller's first `next()` to its last — since the native
 * pipeline rejects a second concurrent caller. Resolves only once a
 * generator finishes, so the next one in line does not start early.
 */
let synthesisQueue: Promise<unknown> = Promise.resolve();

/**
 * How fast this phone makes speech with each engine, measured as it reads.
 * They outlive the pipeline on purpose: the phone is no faster for a change of
 * accent.
 */
const meters: Record<TtsEngineId, PaceMeter> = {
  kokoro: createPaceMeter(),
  supertonic: createPaceMeter(),
  paradee: createPaceMeter(),
};
/**
 * Supertonic's pace as it would be at its best step count, which is what
 * decides how many steps this phone is given. Kept apart from `meters`, whose
 * pace is the one actually heard and decides the chunk size.
 */
const supertonicBest = createPaceMeter();
/** Whether the loaded pipeline has yet to run. Its first chunk is not a fair measure, see `pacedSynthesis`. */
let fresh = false;

/** One line per utterance in a development build: what to read when judging this on a phone. */
function logTiming(label: string, { chunks, firstAudioSeconds, audioSeconds, workSeconds }: UtteranceTiming): void {
  if (!__DEV__ || audioSeconds <= 0) return;
  console.log(
    `[tts] ${label}: ${chunks} chunk${chunks === 1 ? '' : 's'}, first audio after ${firstAudioSeconds.toFixed(1)}s, ` +
      `${audioSeconds.toFixed(1)}s of speech in ${workSeconds.toFixed(1)}s (x${(workSeconds / audioSeconds).toFixed(2)})`,
  );
}

/**
 * The Kokoro pipeline for `accent`, or Supertonic's or Paradee's, loaded from
 * local files if it isn't the one already loaded. Only ever called from
 * inside a synthesis turn.
 *
 * Never fetches: like `device-llm`'s `loadEngine`, this must not start a
 * multi-gigabyte-or-not download just because something asked for a voice.
 */
async function load(want: Wanted): Promise<Loaded> {
  const same = engine?.kind === want.kind && (want.kind !== 'kokoro' || (engine.kind === 'kokoro' && engine.accent === want.accent));
  if (engine && same) return engine;

  engine?.pipeline.dispose();
  engine = null;

  const et = getExecuTorch();
  if (want.kind === 'supertonic') {
    const files = await localSupertonicFiles();
    if (!et || !files) throw new Error("Supertonic isn't downloaded.");
    engine = { kind: 'supertonic', pipeline: await et.createSupertonicTextToSpeech(files) };
  } else if (want.kind === 'paradee') {
    const files = await localParadeeFiles();
    if (!et || !files) throw new Error("Paradee isn't downloaded.");
    engine = { kind: 'paradee', pipeline: await et.createKokoroTextToSpeech(files) };
  } else {
    const files = await localKokoroFiles(want.accent);
    if (!et || !files) throw new Error("Kokoro isn't downloaded.");
    engine = { kind: 'kokoro', accent: want.accent, pipeline: await et.createKokoroTextToSpeech(files) };
  }
  fresh = true;
  return engine;
}

/**
 * Streams synthesized audio for one utterance. Serialized: the native
 * pipeline rejects a second concurrent caller. The utterance is cut into
 * chunks sized to how fast this phone has been making speech (`pace.ts`), so
 * a slow phone starts each sentence sooner.
 *
 * The queue slot is reserved synchronously, on call, rather than on first
 * iteration — a plain function returning a generator, not a generator
 * function itself — so two calls always run in the order they were made, not
 * the order each one happened to start being drained.
 */
export function synthesize(text: string, options: { voice: AiVoice; speed?: number }): AsyncGenerator<SpeechChunk> {
  const myTurn = synthesisQueue;
  let releaseTurn!: () => void;
  synthesisQueue = new Promise<void>((resolve) => {
    releaseTurn = resolve;
  });

  async function* run() {
    await myTurn;
    try {
      // Whatever was asked for, never a voice of an engine this phone is not
      // offered: loading one too large for it kills the app, which nothing
      // here could catch.
      const voice = resolveVoice(options.voice);
      const { speed } = options;
      const loaded = await load(wantedFor(voice));
      const first = fresh;
      fresh = false;
      if (loaded.kind === 'supertonic' && isSupertonicVoice(voice)) {
        const totalSteps = supertonicSteps(supertonicBest.pace());
        const spoken = { voiceStyle: supertonicStyle(voice), speed: supertonicSpeed(speed), lang: 'en' as const, totalSteps };
        const onDone = (timing: UtteranceTiming) => {
          // A pipeline's first run also pays for setting itself up.
          if (!first) supertonicBest.record(timing.audioSeconds, atBestSteps(timing.workSeconds, totalSteps));
          logTiming(`supertonic, ${totalSteps} steps`, timing);
        };
        yield* pacedSynthesis(loaded.pipeline, text, spoken, meters.supertonic, { fresh: first, onDone, parts: supertonicParts });
      } else if (loaded.kind !== 'supertonic') {
        // Kokoro's pipeline and Paradee's are the same one over different
        // files, so they are paced the same way, each by its own meter.
        const onDone = (timing: UtteranceTiming) => logTiming(loaded.kind, timing);
        yield* pacedSynthesis(loaded.pipeline, text, { voice, speed }, meters[loaded.kind], { fresh: first, onDone, limits: KOKORO_CHUNKS });
      }
    } finally {
      releaseTurn();
    }
  }
  return run();
}

export function stop(): void {
  engine?.pipeline.synthesizeStop();
}

/**
 * Frees the loaded voice, once whatever it is saying has finished.
 *
 * For when memory is needed for something larger: waking a brain on a phone
 * where it is a tight fit (`stores/model`). The voice loads again the next
 * time something is read aloud. Takes its turn in the synthesis queue, so it
 * never frees a pipeline that is mid-utterance.
 */
export function releaseVoice(): Promise<void> {
  if (!engine) return Promise.resolve();
  const myTurn = synthesisQueue;
  const done = (async () => {
    await myTurn;
    engine?.pipeline.dispose();
    engine = null;
  })();
  // A failed dispose must not hold up the next utterance.
  synthesisQueue = done.catch(() => undefined);
  return done;
}
