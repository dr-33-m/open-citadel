/**
 * One short clip per cloud voice, made once and served as a file.
 *
 * Trying voices must never spend a reader's Neurons, and making a clip on
 * every press would spend the house's instead, so each voice is read once by
 * an admin call (`POST /admin/voices/samples`, wrapped by
 * `scripts/generate-voice-samples.sh`), written to the data volume beside the
 * database, and served from there with long cache headers and no sign-in.
 *
 * MP3 where the maker makes it: a sample is played whole by `expo-audio`,
 * and MP3 is a tenth of the size. A maker that only answers PCM (Gemini) gets
 * a WAV instead, the same PCM behind a 44-byte header, which `expo-audio`
 * also plays. A few hundred kilobytes for a clip played once, and no encoder
 * in the container.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { speechFormatFor, type CloudVoiceModel } from 'samwell-shared';

import { parseAudioFormat, requestSpeech } from './tts-upstream.js';

/** On the data volume in production (see the Dockerfile), beside the code in development. */
export function samplesDir(): string {
  return process.env.VOICE_SAMPLES_DIR ?? './voice-samples';
}

/**
 * What every voice says. Short, so a sample costs next to nothing to make and
 * starts at once; plain, so the voice is what is being judged.
 */
export const SAMPLE_TEXT =
  'Here is how I sound when I read to you. Find a quiet chair, and we will begin the next chapter together.';

/** Model ids carry a slash; a folder name cannot. */
function modelFolder(modelId: string): string {
  return modelId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

const SAFE_VOICE = /^[A-Za-z0-9_-]{1,64}$/;

/** The two kinds of clip, by the file they are kept in. */
export const SAMPLE_KINDS = [
  { extension: 'mp3', contentType: 'audio/mpeg' },
  { extension: 'wav', contentType: 'audio/wav' },
] as const;

export type SampleExtension = (typeof SAMPLE_KINDS)[number]['extension'];

/**
 * Where a voice's clip lives, or null for a voice that cannot have one.
 *
 * The voice is checked against the model's own list and a strict shape
 * before it reaches a path, so a request cannot walk out of the folder.
 */
export function samplePath(
  model: CloudVoiceModel,
  voice: string,
  extension: SampleExtension,
  dir = samplesDir(),
): string | null {
  if (!SAFE_VOICE.test(voice) || !model.voices.includes(voice)) return null;
  return join(dir, modelFolder(model.id), `${voice}.${extension}`);
}

/**
 * A voice's clip, whichever kind it was made as. The URL does not say: a
 * maker can move from PCM to MP3, and the app asks the same URL either way.
 */
export async function readSample(
  model: CloudVoiceModel,
  voice: string,
  dir = samplesDir(),
): Promise<{ audio: ArrayBuffer; contentType: string } | null> {
  for (const kind of SAMPLE_KINDS) {
    const path = samplePath(model, voice, kind.extension, dir);
    if (!path) return null;
    try {
      const file = await readFile(path);
      if (file.byteLength === 0) continue;
      const audio = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
      return { audio, contentType: kind.contentType };
    } catch {
      // Not made as this kind; try the next.
    }
  }
  return null;
}

/** Raw little-endian 16-bit PCM as a WAV file: the standard 44-byte header, then the samples. */
export function wavFile(pcm: Uint8Array, sampleRate: number, channels: number): Uint8Array {
  const header = new DataView(new ArrayBuffer(44));
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) header.setUint8(offset + i, text.charCodeAt(i));
  };
  const bytesPerFrame = channels * 2;
  ascii(0, 'RIFF');
  header.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true); // PCM
  header.setUint16(22, channels, true);
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * bytesPerFrame, true);
  header.setUint16(32, bytesPerFrame, true);
  header.setUint16(34, 16, true);
  ascii(36, 'data');
  header.setUint32(40, pcm.byteLength, true);
  const file = new Uint8Array(44 + pcm.byteLength);
  file.set(new Uint8Array(header.buffer), 0);
  file.set(pcm, 44);
  return file;
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

export interface SampleRun {
  made: number;
  skipped: number;
  failed: { modelId: string; voice: string; status: number | string }[];
}

/**
 * Read every voice that has no clip yet (all of them, with `force`).
 *
 * One at a time: a few hundred short requests are quick enough in a row, and
 * a burst would only meet the makers' own rate limits. A voice that fails is
 * reported and left for the next run rather than stopping the rest.
 */
export async function generateSamples(options: {
  models: CloudVoiceModel[];
  apiKey: string;
  force?: boolean;
  /** Limit to the voices a reader can be shown; omitted means every voice listed. */
  voicesFor?: (model: CloudVoiceModel) => string[];
  fetchImpl?: typeof fetch;
  dir?: string;
}): Promise<SampleRun> {
  const run: SampleRun = { made: 0, skipped: 0, failed: [] };
  const dir = options.dir ?? samplesDir();
  for (const model of options.models) {
    await mkdir(join(dir, modelFolder(model.id)), { recursive: true });
    for (const voice of options.voicesFor?.(model) ?? model.voices) {
      const mp3Path = samplePath(model, voice, 'mp3', dir);
      const wavPath = samplePath(model, voice, 'wav', dir);
      if (!mp3Path || !wavPath) continue;
      if (!options.force && ((await exists(mp3Path)) || (await exists(wavPath)))) {
        run.skipped += 1;
        continue;
      }
      try {
        const asked = speechFormatFor(model, 'mp3');
        const response = await requestSpeech(
          { modelId: model.id, voice, text: SAMPLE_TEXT, format: asked },
          { apiKey: options.apiKey, fetchImpl: options.fetchImpl },
        );
        if (!response.ok) {
          run.failed.push({ modelId: model.id, voice, status: response.status });
          continue;
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        // Kept as what came back, which is what was asked for unless the
        // reply says otherwise in its content type.
        const format = parseAudioFormat(response.headers.get('content-type'));
        const kind = format.kind === 'unknown' ? asked : format.kind;
        if (kind === 'pcm') await writeFile(wavPath, wavFile(bytes, format.sampleRate, format.channels));
        else await writeFile(mp3Path, bytes);
        run.made += 1;
      } catch (error) {
        run.failed.push({ modelId: model.id, voice, status: String(error) });
      }
    }
  }
  return run;
}
