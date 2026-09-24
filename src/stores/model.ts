import { eq } from "drizzle-orm";
import {
  cacheDirectory,
  deleteAsync,
  documentDirectory,
  getFreeDiskStorageAsync,
  readDirectoryAsync,
} from "expo-file-system/legacy";
import type { RnExecuTorchError } from "react-native-executorch";
import { create } from "zustand";

import { showToast } from "@/components/toast/toast-provider";
import { db } from "@/db/client";
import { appSettings, deviceModels } from "@/db/schema";
import { getExecuTorch, isExecuTorchAvailable } from "@/lib/executorch";
import { catalogueModel, DEVICE_CATALOGUE } from "@/services/device-llm/catalogue";
import { isEngineLoaded, loadEngine, unloadEngine } from "@/services/device-llm/engine";
import { afterErrand } from "@/services/device-llm/errands";
import {
  deleteModelFiles,
  downloadModelFiles,
  localModelFiles,
  remoteUrls,
} from "@/services/device-llm/files";
import { totalSizeBytes } from "@/services/huggingface";
import { formatBytes } from "@/utils/format";
import { checkModelMemory, type MemoryEstimate } from "@/utils/memory-estimator";

export interface InferenceSettings {
  enableToolCalling: boolean;
  /** Whether a brain that can reason does so before it answers. */
  enableThinking: boolean;
}

/** A catalogue brain and what this device holds of it. */
export interface LocalModel {
  id: string;
  name: string;
  /** Every file it needs, in bytes. Null until Hugging Face has been asked. */
  sizeBytes: number | null;
  isDownloaded: boolean;
  isActive: boolean;
  downloadedAt: string | null;
  /** Whether we can read its tool calls. */
  supportsToolCalling: boolean;
  /** Whether it can reason before it answers, and be told to or not. */
  supportsThinking: boolean;
  /** The brain the app points readers to first. */
  recommended: boolean;
}

const DEFAULT_INFERENCE: InferenceSettings = {
  enableToolCalling: true,
  // Off: on the small windows most brains have, reasoning can use up the
  // room a reply has and leave no answer at all.
  enableThinking: false,
};

interface ModelStore {
  models: LocalModel[];
  activeModelId: string | null;
  /** True once loadModels() has completed at least once — distinguishes
   * "models not loaded yet" from "no model set up", which the chat tab
   * rendered identically (a false "Set up Samwell" on first open). */
  modelsHydrated: boolean;
  isLoaded: boolean;
  isLoading: boolean;
  loadError: string | null;
  downloadProgress: Record<string, number>; // modelId → 0–1
  inference: InferenceSettings;
  memoryEstimate: MemoryEstimate | null;

  loadModels(): Promise<void>;
  /** Fills in what each brain weighs, for any not yet measured, or only `ids`. Needs the network. */
  measureModels(ids?: readonly string[]): Promise<void>;
  setActiveModel(id: string): Promise<void>;
  downloadModel(id: string): Promise<void>;
  cancelDownload(id: string): void;
  /** Removes a brain's files. It stays in the list, ready to download again. */
  deleteModel(id: string): Promise<void>;
  initContext(): Promise<void>;
  releaseContext(): Promise<void>;
  setInference(settings: Partial<InferenceSettings>): Promise<void>;
  checkMemory(modelId: string): Promise<void>;
}

/** How long a wake may take before it is worth explaining. */
const SLOW_WAKE_NOTICE_MS = 3000;

/** Keyed so a second wake replaces the first notice rather than stacking. */
const WAKE_TOAST_KEY = 'samwell-wake';

/** Marks the one-time clear-out of the LiteRT runtime's files as done. */
const LITERT_CLEARED_KEY = 'device.litertCleared';

/**
 * Settings only the LiteRT runtime understood. `inference.enableThinking` is
 * not among them: it meant the same then as it does now, so it carries over.
 */
const RETIRED_SETTINGS = [
  'inference.contextSize',
  'inference.backend',
  'inference.enableSpeculativeDecoding',
  'inference.cpuThreads',
  'inference.gpuLayers',
  'device.unavailableBackends',
  'device.attemptingBackend',
];

/** In-flight downloads, so one can be called off. Not state: nothing renders off it. */
const downloads = new Map<string, AbortController>();

/**
 * The wake in flight. Every wake button, the chat banner and the wake dialog
 * can all be pressed at once, and each used to start its own multi-second
 * model load; now they share one.
 */
let waking: Promise<void> | null = null;

/**
 * Frees what the LiteRT runtime left on the device, once.
 *
 * Its models lived in `litert-models/` (2.5 GB for the one most readers had),
 * and its engine wrote caches named after them into the cache directory, up to
 * 2.2 GB more per model. ExecuTorch cannot read either, so both go.
 */
async function clearLiteRtFiles(): Promise<void> {
  const done = db.select().from(appSettings).where(eq(appSettings.key, LITERT_CLEARED_KEY)).get();
  if (done) return;

  const docs = documentDirectory ?? "";
  await deleteAsync(`${docs}litert-models/`, { idempotent: true }).catch(() => {});
  await deleteAsync(`${docs}llama-models/`, { idempotent: true }).catch(() => {});
  if (cacheDirectory) {
    const names = await readDirectoryAsync(cacheDirectory).catch(() => [] as string[]);
    await Promise.all(
      names
        .filter((n) => n.includes(".litertlm"))
        .map((n) => deleteAsync(cacheDirectory + n, { idempotent: true }).catch(() => {})),
    );
  }
  for (const key of RETIRED_SETTINGS) {
    db.delete(appSettings).where(eq(appSettings.key, key)).run();
  }

  db.insert(appSettings)
    .values({ key: LITERT_CLEARED_KEY, value: "1" })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: "1" } })
    .run();
}

/** The runtime's own error code, when it was the runtime that failed. */
function runtimeError(err: unknown): RnExecuTorchError | null {
  const et = getExecuTorch();
  return et?.isRnExecuTorchError(err) ? err : null;
}

/** What a failed wake means, in words for the reader. */
function wakeErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : "Failed to load model";
  const code = runtimeError(err)?.etRuntimeErrorCode;
  const lower = msg.toLowerCase();
  // ExecuTorch's MemoryAllocationFailed (0x21), or an allocator's own words.
  if (code === 0x21 || lower.includes("out of memory") || lower.includes("alloc")) {
    return "This brain is too large for this device. Try a smaller one.";
  }
  // InvalidProgram (0x23): not a program this runtime can read, whether
  // damaged or exported for a different version of it.
  if (code === 0x23) {
    return "This brain's files can't be read. Delete it and download it again.";
  }
  return `Failed to load model: ${msg}`;
}

function rowsToModels(): LocalModel[] {
  const rows = new Map(db.select().from(deviceModels).all().map((r) => [r.id, r]));
  return DEVICE_CATALOGUE.map((entry) => {
    const row = rows.get(entry.id);
    return {
      id: entry.id,
      name: entry.name,
      sizeBytes: row?.sizeBytes ?? null,
      isDownloaded: row?.isDownloaded === 1,
      isActive: row?.isActive === 1,
      downloadedAt: row?.downloadedAt ?? null,
      supportsToolCalling: !!entry.toolFormat,
      supportsThinking: !!entry.thinking,
      recommended: !!entry.recommended,
    };
  });
}

function patchModel(id: string, patch: Partial<LocalModel>) {
  return (s: ModelStore) => ({
    models: s.models.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  });
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

export const useModelStore = create<ModelStore>((set, get) => ({
  models: [],
  activeModelId: null,
  modelsHydrated: false,
  isLoaded: false,
  isLoading: false,
  loadError: null,
  downloadProgress: {},
  inference: { ...DEFAULT_INFERENCE },
  memoryEstimate: null,

  async loadModels() {
    // Off the path to the list: the old runtime's gigabytes can take a while
    // to delete, and nothing here needs them gone first.
    void clearLiteRtFiles().catch((err) => console.warn('[Models] Could not clear LiteRT files:', err));

    // Every brain in the catalogue has a row, so the picker lists them all
    // from the first launch. A row for a brain the catalogue has since
    // dropped goes, since there is nothing left to show it by.
    const known = new Set(DEVICE_CATALOGUE.map((m) => m.id));
    for (const row of db.select().from(deviceModels).all()) {
      if (!known.has(row.id)) db.delete(deviceModels).where(eq(deviceModels.id, row.id)).run();
    }
    for (const entry of DEVICE_CATALOGUE) {
      db.insert(deviceModels).values({ id: entry.id }).onConflictDoNothing().run();
    }

    // Nothing selected, on a first launch or after the active brain was
    // dropped: the recommended one, rather than the chat tab's "Set up
    // Samwell" empty state.
    const rows = db.select().from(deviceModels).all();
    if (!rows.some((r) => r.isActive === 1)) {
      const fallback = DEVICE_CATALOGUE.find((m) => m.recommended) ?? DEVICE_CATALOGUE[0];
      db.update(deviceModels).set({ isActive: 1 }).where(eq(deviceModels.id, fallback.id)).run();
    }

    const models = rowsToModels();
    const settingsRows = db.select().from(appSettings).all();
    const settingsMap = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
    const inference: InferenceSettings = {
      enableToolCalling: settingsMap['inference.enableToolCalling'] !== 'false', // default true
      enableThinking: settingsMap['inference.enableThinking'] === 'true', // default false
    };

    const activeModelId = models.find((m) => m.isActive)?.id ?? null;
    set({
      models,
      activeModelId,
      inference,
      modelsHydrated: true,
    });

    // The Samwell card shows the active brain's size before anything is
    // downloaded, and on a first launch nothing had measured it: the size
    // only arrived once the picker was opened. The rest wait for the picker.
    if (activeModelId) {
      void get()
        .measureModels([activeModelId])
        .catch((err) => console.warn('[Models] Could not measure the active brain:', err));
    }
  },

  async measureModels(ids) {
    const unmeasured = get().models.filter((m) => m.sizeBytes == null && (!ids || ids.includes(m.id)));
    await Promise.all(
      unmeasured.map(async (m) => {
        const entry = catalogueModel(m.id);
        if (!entry) return;
        const sizeBytes = await totalSizeBytes(remoteUrls(entry)).catch(() => null);
        if (sizeBytes == null) return;
        db.update(deviceModels).set({ sizeBytes }).where(eq(deviceModels.id, m.id)).run();
        set(patchModel(m.id, { sizeBytes }));
      }),
    );
  },

  async setActiveModel(id) {
    db.update(deviceModels).set({ isActive: 0 }).run();
    db.update(deviceModels).set({ isActive: 1 }).where(eq(deviceModels.id, id)).run();
    set((s) => ({
      activeModelId: id,
      models: s.models.map((m) => ({ ...m, isActive: m.id === id })),
    }));

    if (get().isLoaded) {
      await afterErrand();
      await unloadEngine();
      set({ isLoaded: false });
    }
  },

  async downloadModel(id) {
    const entry = catalogueModel(id);
    if (!entry || downloads.has(id)) return;

    // The storage check needs the size, which a brain never browsed may not
    // have yet.
    let required = get().models.find((m) => m.id === id)?.sizeBytes ?? null;
    if (required == null) {
      required = await totalSizeBytes(remoteUrls(entry)).catch(() => null);
      if (required != null) {
        db.update(deviceModels).set({ sizeBytes: required }).where(eq(deviceModels.id, id)).run();
        set(patchModel(id, { sizeBytes: required }));
      }
    }
    const freeSpace = await getFreeDiskStorageAsync();
    if (required && freeSpace < required * 1.1) {
      set({
        loadError: `Not enough storage. ${formatBytes(required)} required, ${formatBytes(freeSpace)} free.`,
      });
      return;
    }

    const controller = new AbortController();
    downloads.set(id, controller);
    set((s) => ({ downloadProgress: { ...s.downloadProgress, [id]: 0 }, loadError: null }));

    try {
      await downloadModelFiles(entry, {
        signal: controller.signal,
        onProgress: (fraction) =>
          set((s) => ({ downloadProgress: { ...s.downloadProgress, [id]: fraction } })),
      });

      const now = new Date().toISOString();
      db.update(deviceModels)
        .set({ isDownloaded: 1, downloadedAt: now })
        .where(eq(deviceModels.id, id))
        .run();
      set(patchModel(id, { isDownloaded: true, downloadedAt: now }));
    } catch (err: unknown) {
      // A cancel is the reader's own choice, not a failure worth a message.
      if (runtimeError(err)?.code === 'DOWNLOAD_ABORTED') return;

      const msg = err instanceof Error ? err.message : "Download failed";
      const isStorageError =
        msg.includes("No space left") || msg.toLowerCase().includes("storage");
      set({
        loadError: isStorageError
          ? "Not enough storage to complete the download."
          : `Download failed: ${msg}`,
      });
    } finally {
      downloads.delete(id);
      set((s) => ({ downloadProgress: withoutKey(s.downloadProgress, id) }));
    }
  },

  cancelDownload(id) {
    // What arrived so far is kept, so downloading it again carries on from
    // there rather than starting over.
    downloads.get(id)?.abort();
  },

  async deleteModel(id) {
    const entry = catalogueModel(id);
    const model = get().models.find((m) => m.id === id);
    if (!entry || !model?.isDownloaded) return;

    // Unloaded first: the engine holds the model's files open while it runs.
    if (get().isLoaded && get().activeModelId === id) {
      await unloadEngine();
      set({ isLoaded: false });
    }

    const keep = new Set(
      get()
        .models.filter((m) => m.isDownloaded && m.id !== id)
        .flatMap((m) => {
          const other = catalogueModel(m.id);
          return other ? remoteUrls(other) : [];
        }),
    );
    await deleteModelFiles(entry, keep);

    db.update(deviceModels)
      .set({ isDownloaded: 0, downloadedAt: null })
      .where(eq(deviceModels.id, id))
      .run();
    set(patchModel(id, { isDownloaded: false, downloadedAt: null }));
  },

  initContext() {
    if (!waking) {
      waking = wake().finally(() => {
        waking = null;
      });
    }
    return waking;
  },

  async releaseContext() {
    // A chat being named is let finish, with a toast saying so, rather than
    // torn down halfway through.
    await afterErrand();
    await unloadEngine();
    set({ isLoaded: false, loadError: null });
  },

  async setInference(partial) {
    const merged = { ...get().inference, ...partial };
    set({ inference: merged });

    for (const [key, value] of Object.entries(partial)) {
      db.insert(appSettings)
        .values({ key: `inference.${key}`, value: String(value) })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: String(value) } })
        .run();
    }
  },

  async checkMemory(modelId) {
    const model = get().models.find((m) => m.id === modelId);
    if (!model) {
      set({ memoryEstimate: null });
      return;
    }
    try {
      set({ memoryEstimate: checkModelMemory(model.sizeBytes) });
    } catch {
      set({ memoryEstimate: null });
    }
  },
}));

/** Loads the active brain. Only through `initContext`, which keeps it to one at a time. */
async function wake(): Promise<void> {
  const get = useModelStore.getState;
  const set = useModelStore.setState;
  const { models, activeModelId } = get();
  const model = models.find((m) => m.id === activeModelId);
  const entry = catalogueModel(activeModelId);
  if (!model?.isDownloaded || !entry) {
    set({ loadError: "No downloaded model selected." });
    return;
  }

  if (!isExecuTorchAvailable()) {
    set({ loadError: "AI chat isn't supported on this device." });
    return;
  }

  set({ isLoading: true, loadError: null });

  /*
   * Waking is measured in seconds on a mid-range phone, and the engine
   * reports no progress while it does it, so the indicator has nothing to
   * count towards. Left alone that reads as a stall rather than as work.
   *
   * The notice is delayed rather than raised immediately: a wake that
   * finishes quickly should say nothing at all, and three seconds is long
   * enough to tell the two apart. Cleared on every exit below, so a fast
   * wake never leaves it queued behind itself.
   */
  const slowWakeNotice = setTimeout(() => {
    showToast({
      key: WAKE_TOAST_KEY,
      message: 'Samwell is waking up. Hang tight, this can take a few moments.',
    });
  }, SLOW_WAKE_NOTICE_MS);

  try {
    const files = await localModelFiles(entry);
    if (!files) {
      // Recorded as downloaded, and not on the device: cleared by the OS or
      // by hand. Saying so is better than a load error about a path.
      clearTimeout(slowWakeNotice);
      db.update(deviceModels)
        .set({ isDownloaded: 0, downloadedAt: null })
        .where(eq(deviceModels.id, entry.id))
        .run();
      set({
        ...patchModel(entry.id, { isDownloaded: false, downloadedAt: null })(get()),
        isLoading: false,
        loadError: "This brain's files are missing. Download it again.",
      });
      return;
    }

    await loadEngine(entry, files);
    clearTimeout(slowWakeNotice);

    // Released while it loaded (the app went to the background), or another
    // brain was chosen: the reader no longer wants this one, and holding it
    // would answer as the wrong model.
    if (!isEngineLoaded() || get().activeModelId !== entry.id) {
      await unloadEngine();
      set({ isLoading: false, isLoaded: false });
      return;
    }

    // No warmup turn here, deliberately. What it would buy (weights paged
    // in) is paid for by the first real message anyway, and at least that
    // one is a message the reader asked for.
    set({ isLoaded: true, isLoading: false });
  } catch (err: unknown) {
    clearTimeout(slowWakeNotice);
    set({
      isLoading: false,
      isLoaded: false,
      loadError: wakeErrorMessage(err),
    });
  }
}
