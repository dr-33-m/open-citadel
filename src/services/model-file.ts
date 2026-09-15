/**
 * Verification for a downloaded `.litertlm` file.
 *
 * `downloadAsync` resolves happily on a 401 or a 404: it writes the server's
 * error body to disk and reports success. That is how a 137-byte "Access to
 * model ... is restricted" page ended up on the device named
 * `Gemma3-1B-IT_multi-prefill-seq_q4_ekv4096.litertlm`, flagged as downloaded
 * and labelled 584 MB. Nothing noticed until the native loader refused it with
 * `INVALID_ARGUMENT: Invalid magic number`, hours of cellular data later.
 *
 * So every download is checked here before it counts as a model.
 */

import { getInfoAsync, readAsStringAsync, EncodingType } from 'expo-file-system/legacy';

/** base64 of the 8-byte ASCII magic every `.litertlm` file opens with. */
const LITERTLM_MAGIC_B64 = 'TElURVJUTE0=';

/** Nothing this small can be a model, and anything this small is readable as a message. */
const PREVIEW_LIMIT_BYTES = 4096;

export type ModelFileCheck =
  | { ok: true; sizeBytes: number }
  | {
      ok: false;
      /**
       * `missing`: nothing on disk. `notAModel`: read, and the wrong magic,
       * usually an error page. `unreadable`: there, but the read itself failed,
       * which says nothing about the file and must never be taken as proof it
       * is bad.
       */
      reason: 'missing' | 'notAModel' | 'unreadable';
      sizeBytes: number;
      /** The server's own words, when the file turned out to be a short text body. */
      serverMessage: string | null;
    };

/**
 * Whether `filePath` holds something the engine can actually load.
 *
 * Checks the magic rather than the length, because a truncated-but-real model
 * and a wholesale wrong file fail for different reasons and only the second
 * has anything useful to say to the reader.
 */
export async function verifyModelFile(filePath: string): Promise<ModelFileCheck> {
  const info = await getInfoAsync(filePath);
  if (!info.exists || info.isDirectory) {
    return { ok: false, reason: 'missing', sizeBytes: 0, serverMessage: null };
  }

  const sizeBytes = (info as { size?: number }).size ?? 0;

  let magic: string;
  try {
    magic = await readAsStringAsync(filePath, {
      encoding: EncodingType.Base64,
      position: 0,
      length: 8,
    });
  } catch {
    // Folded into `notAModel` before, a read that failed for any passing
    // reason got a multi-gigabyte model deleted by the launch repair pass.
    return { ok: false, reason: 'unreadable', sizeBytes, serverMessage: null };
  }

  if (magic === LITERTLM_MAGIC_B64) return { ok: true, sizeBytes };

  return {
    ok: false,
    reason: 'notAModel',
    sizeBytes,
    serverMessage: await readServerMessage(filePath, sizeBytes),
  };
}

/**
 * A rejected download is usually a short text body explaining itself. Surfacing
 * it beats any message this app could invent, so it is read back verbatim when
 * the file is small enough to be one.
 */
async function readServerMessage(filePath: string, sizeBytes: number): Promise<string | null> {
  if (sizeBytes === 0 || sizeBytes > PREVIEW_LIMIT_BYTES) return null;
  try {
    const text = (await readAsStringAsync(filePath, { encoding: EncodingType.UTF8 })).trim();
    // An HTML error page says nothing a reader wants; a plain sentence does.
    if (!text || text.startsWith('<')) return null;
    return text;
  } catch {
    return null;
  }
}
