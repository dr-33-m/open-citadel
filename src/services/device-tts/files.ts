/**
 * The voice engines' files on this device: fetching them, finding them.
 *
 * Same contract as `device-llm/files.ts` (see that file for the reasoning):
 * ExecuTorch's `download` owns the cache, so the app only ever asks the disk
 * directly whether a file `download` would use is already there, and never
 * calls `download` speculatively.
 *
 * Unlike an `LLMModel`, a `KokoroTtsModel`'s URLs are nested at different
 * depths (`modelPaths.durationPredictor`, `phonemizer.neuralModelSource`,
 * `voices.<name>`) and the voice set varies by language, so the file list is
 * collected by walking the object rather than a fixed set of keys.
 */

import RNBlobUtil from 'react-native-blob-util';
import type { KokoroTtsModel, SupertonicTtsModel } from 'react-native-executorch';

import { cachePath, getExecuTorch } from '@/lib/executorch';
import type { TtsEngineId } from '@/services/device-tts/catalogue';
import { kokoroModels, type KokoroAccent } from '@/services/device-tts/kokoro';
import { paradeeModel } from '@/services/device-tts/paradee';
import { supertonicModel } from '@/services/device-tts/supertonic';

/** Every remote URL nested inside a model config, in no particular order. */
function collectUrls(value: unknown): string[] {
  if (typeof value === 'string') return value.startsWith('http') ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(collectUrls);
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectUrls);
  return [];
}

/** Everything an engine downloads, as one value `download` can walk, or null without the runtime. */
function packSource(engine: TtsEngineId): unknown {
  if (engine === 'kokoro') return kokoroModels();
  return engine === 'paradee' ? paradeeModel() : supertonicModel();
}

/**
 * Every URL an engine needs. For Kokoro that is both accents: the two share
 * their weights, so the list is deduplicated and the second accent only adds
 * a phonemizer and its voices.
 */
export function remoteUrls(engine: TtsEngineId): string[] {
  const source = packSource(engine);
  return source ? [...new Set(collectUrls(source))] : [];
}

/** Fetches every file an engine needs. Rejects with `DOWNLOAD_ABORTED` when `signal` fires. */
export async function downloadModelFiles(
  engine: TtsEngineId,
  options: { onProgress: (fraction: number) => void; signal: AbortSignal },
): Promise<void> {
  const et = getExecuTorch();
  const source = packSource(engine);
  if (!et || !source) throw new Error("On-device voices aren't supported on this device.");
  // One call for the whole pack, so progress is weighted across every file
  // and Kokoro's shared weights are fetched once.
  await et.download(source, options);
}

/**
 * `model` with its URLs swapped for local paths, or null when any file of
 * `engine`'s pack is missing. Never touches the network — see
 * `device-llm/files.ts`'s identical note.
 */
async function localCopy<T>(engine: TtsEngineId, model: T | null | undefined): Promise<T | null> {
  const et = getExecuTorch();
  if (!et || !model) return null;

  const urls = remoteUrls(engine);
  const present = await Promise.all(urls.map((url) => RNBlobUtil.fs.exists(cachePath(url)).catch(() => false)));
  if (!present.every(Boolean)) return null;

  try {
    return await et.download(model);
  } catch {
    return null;
  }
}

/**
 * One accent's Kokoro files on this device, or null when any file of either
 * accent is missing.
 *
 * Checks both accents so a half-finished or older, US-only download reads as
 * not downloaded rather than failing later on the first British voice.
 */
export function localKokoroFiles(accent: KokoroAccent): Promise<KokoroTtsModel<string> | null> {
  return localCopy('kokoro', kokoroModels()?.[accent]);
}

/** Paradee's files on this device, or null when any of them is missing. */
export function localParadeeFiles(): Promise<KokoroTtsModel<string> | null> {
  return localCopy('paradee', paradeeModel());
}

/** Supertonic's files on this device, or null when any of them is missing. */
export function localSupertonicFiles(): Promise<SupertonicTtsModel<string> | null> {
  return localCopy('supertonic', supertonicModel());
}
