/**
 * A brain's files on this device: fetching them, finding them, removing them.
 *
 * ExecuTorch's `download` owns the cache. It stores each file under a name
 * derived from its URL, resumes an interrupted transfer, refuses an HTTP error
 * rather than saving it as a model, and checks the length that arrived. So the
 * app keeps no paths of its own and asks `download` where the files are: for a
 * cached file it answers at once, without touching the network.
 *
 * What `download` cannot do is answer "is it here?" without also fetching it
 * when it is not, so that one question is asked of the disk directly, at the
 * path `download` would use (`cachePath`).
 */

import RNBlobUtil from 'react-native-blob-util';
import type { LLMModel } from 'react-native-executorch';

import { getExecuTorch } from '@/lib/executorch';
import { registryModel, type CatalogueModel } from '@/services/device-llm/catalogue';

const FILE_KEYS = ['modelPath', 'tokenizerPath', 'tokenizerConfigPath'] as const;

/** The same hash ExecuTorch's fetcher names its cached files with. */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Where ExecuTorch's `download` keeps `url`, mirrored from its private
 * `cachePathFor`. A test reads the library's source and fails if that ever
 * changes, because a mismatch here reads every downloaded brain as missing.
 */
export function cachePath(url: string): string {
  const dirs = RNBlobUtil.fs.dirs;
  const root = process.env.EXPO_OS === 'android' ? dirs.SDCardDir || dirs.DocumentDir : dirs.DocumentDir;
  const bare = url.split('?')[0]!;
  const basename = bare.split('/').pop() || 'model';
  return `${root}/react-native-executorch/${djb2(bare)}_${basename}`;
}

/** Every URL an entry downloads. */
export function remoteUrls(entry: CatalogueModel): string[] {
  const remote = registryModel(entry);
  return remote ? FILE_KEYS.map((k) => remote[k]) : [];
}

/** Fetches every file an entry needs. Rejects with `DOWNLOAD_ABORTED` when `signal` fires. */
export async function downloadModelFiles(
  entry: CatalogueModel,
  options: { onProgress: (fraction: number) => void; signal: AbortSignal },
): Promise<void> {
  const et = getExecuTorch();
  const remote = registryModel(entry);
  if (!et || !remote) throw new Error("On-device AI isn't supported on this device.");
  const local = await et.download(remote, options);
  if (__DEV__ && FILE_KEYS.some((k) => local[k] !== cachePath(remote[k]))) {
    console.error('[Models] ExecuTorch cached a file somewhere cachePath() does not look.');
  }
}

/**
 * The entry's files on this device, or null when any of them is missing.
 *
 * Never touches the network. Asking `download` for a file it does not have
 * starts fetching it, and with no connection the transfer waits rather than
 * failing, so the disk is checked first and `download` is only asked about a
 * set it already holds, which it answers from the disk.
 */
export async function localModelFiles(entry: CatalogueModel): Promise<LLMModel | null> {
  const et = getExecuTorch();
  const remote = registryModel(entry);
  if (!et || !remote) return null;

  const present = await Promise.all(
    FILE_KEYS.map((k) => RNBlobUtil.fs.exists(cachePath(remote[k])).catch(() => false)),
  );
  if (!present.every(Boolean)) return null;

  try {
    return await et.download(remote);
  } catch {
    return null;
  }
}

/**
 * Removes an entry's files, keeping any another downloaded brain still uses:
 * sizes of one family share a tokenizer.
 *
 * @param keepUrls Every URL the other downloaded brains need.
 */
export async function deleteModelFiles(entry: CatalogueModel, keepUrls: ReadonlySet<string>): Promise<void> {
  const remote = registryModel(entry);
  if (!remote) return;
  await Promise.all(
    FILE_KEYS.filter((k) => !keepUrls.has(remote[k])).map((k) =>
      RNBlobUtil.fs.unlink(cachePath(remote[k])).catch(() => {}),
    ),
  );
}
