/**
 * The voice engines' download state: whether each one's files are on this
 * device, or downloading.
 *
 * Loading an engine into memory is not this store's job — the reader's
 * synthesis bridge (`use-kokoro-tts-bridge.ts`) calls `device-tts/engine.ts`
 * directly and lazily, the same way a chat turn wakes the LLM only when one
 * is actually sent. There is no separate "wake the voice" moment to hold
 * state for.
 */
import { inArray } from "drizzle-orm";
import { getFreeDiskStorageAsync } from "expo-file-system/legacy";
import { create } from "zustand";

import { showToast } from "@/components/toast/toast-provider";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { totalSizeBytes } from "@/services/huggingface";
import { TTS_ENGINES, type TtsEngineId } from "@/services/device-tts/catalogue";
import { downloadModelFiles, remoteUrls } from "@/services/device-tts/files";
import { formatBytes } from "@/utils/format";

const DOWNLOADED_KEYS: Record<TtsEngineId, string> = {
  // v2: the pack grew British voices. Anyone who downloaded the US-only pack sees
  // the download card once more, and only the new files are fetched.
  kokoro: "tts.kokoro.isDownloaded.v2",
  supertonic: "tts.supertonic.isDownloaded",
  // v1: the tag its files are fetched from (`paradee.ts`). A later export is a
  // new tag and a new key, so the download card shows once more for it.
  paradee: "tts.paradee.isDownloaded.v1",
};

/** One engine's files: on the device or not, and how a download of them is going. */
export interface VoicePack {
  isDownloaded: boolean;
  /** 0-1 while downloading, null otherwise. */
  downloadProgress: number | null;
}

const EMPTY_PACK: VoicePack = { isDownloaded: false, downloadProgress: null };

interface TtsStore {
  packs: Record<TtsEngineId, VoicePack>;

  loadState(): Promise<void>;
  downloadModel(engine: TtsEngineId): Promise<void>;
  cancelDownload(engine: TtsEngineId): void;
}

/** The in-flight downloads, so a second call can cancel one. Not state: nothing renders off it. */
const downloads: Partial<Record<TtsEngineId, AbortController>> = {};

/**
 * A download that could not start or finish. Said in a toast, since the card
 * it was started from goes back to offering the download and the reader may
 * have left it for the book by the time it fails.
 */
function fail(message: string) {
  showToast({ key: "voice-download", message });
}

function saveSetting(key: string, value: string) {
  db.insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
    .run();
}

export const useTtsStore = create<TtsStore>((set) => {
  const patch = (engine: TtsEngineId, change: Partial<VoicePack>) =>
    set((state) => ({ packs: { ...state.packs, [engine]: { ...state.packs[engine], ...change } } }));

  return {
    packs: { kokoro: EMPTY_PACK, supertonic: EMPTY_PACK, paradee: EMPTY_PACK },

    async loadState() {
      const rows = db.select().from(appSettings).where(inArray(appSettings.key, Object.values(DOWNLOADED_KEYS))).all();
      const saved = new Set(rows.filter((row) => row.value === "1").map((row) => row.key));
      for (const engine of TTS_ENGINES) patch(engine, { isDownloaded: saved.has(DOWNLOADED_KEYS[engine]) });
    },

    async downloadModel(engine) {
      if (downloads[engine]) return;

      // Claimed, and shown as under way, before anything is awaited: sizing
      // the pack asks the network first, and in that gap the card still read
      // DOWNLOAD, so a second tap started a second download beside the first.
      const controller = new AbortController();
      downloads[engine] = controller;
      patch(engine, { downloadProgress: 0 });

      try {
        const required = await totalSizeBytes(remoteUrls(engine)).catch(() => null);
        const freeSpace = await getFreeDiskStorageAsync();
        if (controller.signal.aborted) return;
        if (required && freeSpace < required * 1.1) {
          fail(`Not enough storage. ${formatBytes(required)} required, ${formatBytes(freeSpace)} free.`);
          return;
        }

        // A report per hundredth, not per chunk: each one redraws the voice
        // settings from the top, and the meter glides between them anyway.
        let shown = 0;
        await downloadModelFiles(engine, {
          signal: controller.signal,
          onProgress: (fraction) => {
            const next = Math.floor(fraction * 100) / 100;
            if (next === shown) return;
            shown = next;
            patch(engine, { downloadProgress: next });
          },
        });
        saveSetting(DOWNLOADED_KEYS[engine], "1");
        patch(engine, { isDownloaded: true });
      } catch (err: unknown) {
        // A cancel is the reader's own choice, not a failure worth a message.
        if (!controller.signal.aborted) {
          const msg = err instanceof Error ? err.message : "Download failed";
          fail(`Download failed: ${msg}`);
        }
      } finally {
        delete downloads[engine];
        patch(engine, { downloadProgress: null });
      }
    },

    cancelDownload(engine) {
      // What arrived so far is kept, so downloading it again carries on from there.
      downloads[engine]?.abort();
    },
  };
});
