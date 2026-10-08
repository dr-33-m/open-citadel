/**
 * One short clip per cloud voice, made once and served as a file.
 *
 * Trying voices must never spend a reader's Neurons, and making a clip on
 * every press would spend the house's instead, so each voice is read once by
 * an admin call (`POST /admin/voices/samples`, wrapped by
 * `scripts/generate-voice-samples.sh`), written to the data volume beside the
 * database, and served from there with long cache headers and no sign-in.
 *
 * mp3 rather than the PCM read-aloud uses: a sample is played whole by
 * `expo-audio`, which plays mp3 natively, and it is a tenth of the size.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { CloudVoiceModel } from 'samwell-shared';

import { requestSpeech } from './tts-upstream.js';

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

/**
 * Where a voice's clip lives, or null for a voice that cannot have one.
 *
 * The voice is checked against the model's own list and a strict shape
 * before it reaches a path, so a request cannot walk out of the folder.
 */
export function samplePath(model: CloudVoiceModel, voice: string, dir = samplesDir()): string | null {
  if (!SAFE_VOICE.test(voice) || !model.voices.includes(voice)) return null;
  return join(dir, modelFolder(model.id), `${voice}.mp3`);
}

export async function readSample(path: string): Promise<ArrayBuffer | null> {
  try {
    const file = await readFile(path);
    return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  } catch {
    return null;
  }
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
      const path = samplePath(model, voice, dir);
      if (!path) continue;
      if (!options.force && (await exists(path))) {
        run.skipped += 1;
        continue;
      }
      try {
        const response = await requestSpeech(
          { modelId: model.id, voice, text: SAMPLE_TEXT, format: 'mp3' },
          { apiKey: options.apiKey, fetchImpl: options.fetchImpl },
        );
        if (!response.ok) {
          run.failed.push({ modelId: model.id, voice, status: response.status });
          continue;
        }
        await writeFile(path, new Uint8Array(await response.arrayBuffer()));
        run.made += 1;
      } catch (error) {
        run.failed.push({ modelId: model.id, voice, status: String(error) });
      }
    }
  }
  return run;
}
