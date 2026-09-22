import * as Device from "expo-device";
import { and, eq } from "drizzle-orm";
import {
  createDownloadResumable,
  deleteAsync,
  documentDirectory,
  getFreeDiskStorageAsync,
  getInfoAsync,
  makeDirectoryAsync,
  type DownloadProgressData,
  type DownloadResumable,
} from "expo-file-system/legacy";
import { create } from "zustand";

import { db } from "@/db/client";
import { appSettings, localModels } from "@/db/schema";
import { createLLM, type Backend } from "@dr33m/react-native-litert-lm";
import * as Inference from "@/services/inference";
import { deleteModelFiles, verifyModelFile } from "@/services/model-file";
import {
  detectCapabilities,
  repoIdFromUrl,
  UNKNOWN_CAPABILITIES,
} from "@/services/model-capabilities";
import { showToast } from "@/components/toast/toast-provider";
import { formatBytes } from "@/utils/format";
import { checkModelMemory, type MemoryEstimate } from "@/utils/memory-estimator";

export interface InferenceSettings {
  contextSize: number;
  backend: Backend;
  enableSpeculativeDecoding: boolean;
  enableToolCalling: boolean;
}

export interface LocalModel {
  id: string;
  name: string;
  filename: string;
  filePath: string | null;
  downloadUrl: string;
  sizeBytes: number | null;
  isDownloaded: boolean;
  isActive: boolean;
  downloadedAt: string | null;
  supportsSpeculativeDecoding: boolean;
  supportsThinking: boolean;
  supportsToolCalling: boolean;
}

const DEFAULT_INFERENCE: InferenceSettings = {
  contextSize: 4096,
  backend: 'cpu',
  enableSpeculativeDecoding: false,
  enableToolCalling: true,
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
  downloadResumables: Record<string, DownloadResumable>;
  inference: InferenceSettings;
  deviceTotalMemory: number | null;
  memoryEstimate: MemoryEstimate | null;
  activeBackend: Backend | null; // actual backend after model loads (detects GPU→CPU fallback)
  unavailableBackends: Set<Backend>; // backends that fell back — disable in UI

  loadModels(): Promise<void>;
  setActiveModel(id: string): Promise<void>;
  addCustomModel(name: string, downloadUrl: string, sizeBytes?: number | null): Promise<void>;
  downloadModel(id: string): Promise<void>;
  cancelDownload(id: string): void;
  deleteModel(id: string): Promise<void>;
  initContext(): Promise<void>;
  releaseContext(): Promise<void>;
  setInference(settings: Partial<InferenceSettings>): Promise<void>;
  checkMemory(modelId: string): Promise<void>;
}

/**
 * The brains offered before the reader has browsed for one.
 *
 * Kept to what has actually been run on a device. The list used to carry three
 * more, chosen by reputation: one of them (`litert-community/Gemma3-1B-IT`) is
 * a gated repo, so every download of it wrote a 401 page to disk and failed
 * much later inside the native loader. Anything untested belongs in the
 * catalogue, where a reader chooses it knowingly, not in the seed list, where
 * the app is vouching for it.
 */
const SEED_MODELS: Omit<
  LocalModel,
  "isDownloaded" | "isActive" | "filePath" | "downloadedAt"
>[] = [
  {
    id: "gemma-4-e2b-it",
    name: "Gemma 4 E2B",
    filename: "gemma-4-E2B-it.litertlm",
    downloadUrl:
      "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm",
    sizeBytes: 2588 * 1024 * 1024,
    supportsSpeculativeDecoding: true,
    supportsThinking: true,
    supportsToolCalling: true,
  },
];

/** Seeded models that turned out to be undownloadable, removed on upgrade. */
const RETIRED_SEED_IDS = [
  "gemma3-1b-it",
  "qwen2.5-1.5b-instruct",
  "deepseek-r1-distill-qwen-1.5b",
];

/**
 * A download that finished but did not produce a model.
 *
 * Worth its own type because the reader needs to hear something different in
 * each case, and only this layer still knows which case it was: a gated repo
 * answers 401 with a sentence explaining itself, a missing file answers 404,
 * and a proxy or captive portal answers 200 with a login page.
 */
class DownloadRejected extends Error {
  constructor(
    readonly status: number,
    /** The server's own explanation, when it sent a short readable one. */
    readonly serverMessage: string | null = null,
  ) {
    super(`Download rejected (${status})`);
    this.name = "DownloadRejected";
  }

  readerMessage(): string {
    if (this.status === 401 || this.status === 403) {
      return "This model is restricted and cannot be downloaded here. Pick another one.";
    }
    if (this.status === 404) {
      return "This model is no longer available at that address.";
    }
    if (this.serverMessage) {
      return `The download did not return a model. The server said: ${this.serverMessage}`;
    }
    return "The download did not return a model file. Check your connection and try again.";
  }
}

/** How long a wake may take before it is worth explaining. */
const SLOW_WAKE_NOTICE_MS = 3000;

/** Keyed so a second wake replaces the first notice rather than stacking. */
const WAKE_TOAST_KEY = 'samwell-wake';

function modelsDir(): string {
  return (documentDirectory ?? "") + "litert-models/";
}

function modelFilePath(filename: string): string {
  return modelsDir() + filename;
}

async function ensureModelsDir() {
  const dir = modelsDir();
  const info = await getInfoAsync(dir);
  if (!info.exists) await makeDirectoryAsync(dir, { intermediates: true });
}

export const useModelStore = create<ModelStore>((set, get) => ({
  models: [],
  activeModelId: null,
  modelsHydrated: false,
  isLoaded: false,
  isLoading: false,
  loadError: null,
  downloadProgress: {},
  downloadResumables: {},
  inference: { ...DEFAULT_INFERENCE },
  deviceTotalMemory: Device.totalMemory,
  memoryEstimate: null,
  activeBackend: null,
  unavailableBackends: new Set<Backend>(),

  async loadModels() {
    // Clean up old GGUF models from llama.rn era (upgrade path)
    const OLD_GGUF_IDS = [
      'llama-3.2-1b-q4',
      'qwen2.5-1.5b-q4',
      'DeepSeek-R1-Distill-Qwen-1.5B-Q2_K_L',
      'gemma-4-E2B-it-UD-IQ2_M',
    ];
    for (const oldId of OLD_GGUF_IDS) {
      const rows = db.select().from(localModels).where(eq(localModels.id, oldId)).all();
      for (const row of rows) {
        if (row.filePath) {
          try { await deleteAsync(row.filePath, { idempotent: true }); } catch { /* file may not exist */ }
        }
      }
      db.delete(localModels).where(eq(localModels.id, oldId)).run();
    }
    // Remove the old llama-models directory entirely
    try { await deleteAsync((documentDirectory ?? '') + 'llama-models/', { idempotent: true }); } catch { /* ok */ }

    // Remove obsolete inference settings from llama.rn
    db.delete(appSettings).where(eq(appSettings.key, 'inference.cpuThreads')).run();
    db.delete(appSettings).where(eq(appSettings.key, 'inference.gpuLayers')).run();
    // Thinking is no longer a setting. The switch never controlled whether a
    // model reasoned, only whether the app admitted it, so the stored value is
    // dropped rather than left to be read by mistake.
    db.delete(appSettings).where(eq(appSettings.key, 'inference.enableThinking')).run();

    // Seed default models if table is empty (first launch or after cleanup)
    const existing = db.select().from(localModels).all();
    if (existing.length === 0) {
      for (const m of SEED_MODELS) {
        db.insert(localModels)
          .values({
            id: m.id,
            name: m.name,
            filename: m.filename,
            filePath: null,
            downloadUrl: m.downloadUrl,
            sizeBytes: m.sizeBytes,
            isDownloaded: 0,
            isActive: m.id === SEED_MODELS[0].id ? 1 : 0,
            downloadedAt: null,
          })
          .run();
      }
    }

    // Repair pass: a download that returned an error page instead of a model
    // was still recorded as downloaded, and a file can also be truncated by a
    // crash or cleared by the OS. Verifying what is actually on disk is the
    // only way to tell, and it is cheap: a stat and eight bytes per model.
    for (const row of db.select().from(localModels).all()) {
      if (row.isDownloaded !== 1 || !row.filePath) continue;
      // Only a file shown to be missing or wrong is cleared. A check that could
      // not run, or could not read the file, keeps it: deleting a working model
      // on a passing IO error costs the reader gigabytes to get back.
      let check: Awaited<ReturnType<typeof verifyModelFile>>;
      try {
        check = await verifyModelFile(row.filePath);
      } catch {
        continue;
      }
      if (check.ok || check.reason === 'unreadable') continue;
      await deleteModelFiles(row.filePath);
      db.update(localModels)
        .set({ isDownloaded: 0, filePath: null, downloadedAt: null })
        .where(eq(localModels.id, row.id))
        .run();
    }

    // Retired seeds go once they hold nothing: a reader who did get one of
    // these working keeps it, and the rest stop advertising a download that
    // cannot succeed.
    for (const retiredId of RETIRED_SEED_IDS) {
      db.delete(localModels)
        .where(and(eq(localModels.id, retiredId), eq(localModels.isDownloaded, 0)))
        .run();
    }

    // Deleting the active model leaves nothing selected; fall back to the first
    // row rather than to the chat tab's "Set up Samwell" empty state.
    const remaining = db.select().from(localModels).all();
    if (remaining.length > 0 && !remaining.some((r) => r.isActive === 1)) {
      db.update(localModels).set({ isActive: 1 }).where(eq(localModels.id, remaining[0].id)).run();
    }

    const rows = db.select().from(localModels).all();
    const models: LocalModel[] = rows.map((r) => {
      return {
        id: r.id,
        name: r.name,
        filename: r.filename,
        filePath: r.filePath ?? null,
        downloadUrl: r.downloadUrl,
        sizeBytes: r.sizeBytes ?? null,
        isDownloaded: r.isDownloaded === 1,
        isActive: r.isActive === 1,
        downloadedAt: r.downloadedAt ?? null,
        supportsSpeculativeDecoding: r.supportsSpeculativeDecoding === 1,
        supportsThinking: r.supportsThinking === 1,
        supportsToolCalling: r.supportsToolCalling === 1,
      };
    });

    const active = models.find((m) => m.isActive);

    // Load persisted inference settings
    const settingsRows = db.select().from(appSettings).all();
    const settingsMap = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
    const inference: InferenceSettings = {
      contextSize: parseInt(settingsMap['inference.contextSize'] ?? String(DEFAULT_INFERENCE.contextSize), 10),
      backend: (settingsMap['inference.backend'] as Backend) ?? DEFAULT_INFERENCE.backend,
      enableSpeculativeDecoding: settingsMap['inference.enableSpeculativeDecoding'] === 'true',
      enableToolCalling: settingsMap['inference.enableToolCalling'] !== 'false', // default true
    };

    // Load persisted unavailable backends (hardware doesn't change between sessions)
    const unavailableRaw = settingsMap['device.unavailableBackends'];
    const unavailableBackends = new Set<Backend>(
      unavailableRaw ? (unavailableRaw.split(',').filter(Boolean) as Backend[]) : []
    );

    // Crash barrier: if the app crashed while attempting a backend (SIGSEGV from
    // GPU/NPU Engine()), the flag is still set. Mark that backend as unavailable.
    const crashedBackend = settingsMap['device.attemptingBackend'] as Backend | undefined;
    if (crashedBackend && crashedBackend !== 'cpu') {
      unavailableBackends.add(crashedBackend);
      db.insert(appSettings)
        .values({ key: 'device.unavailableBackends', value: [...unavailableBackends].join(',') })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: [...unavailableBackends].join(',') } })
        .run();
      // Clear the flag and reset backend to cpu
      db.delete(appSettings).where(eq(appSettings.key, 'device.attemptingBackend')).run();
      db.insert(appSettings)
        .values({ key: 'inference.backend', value: 'cpu' })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: 'cpu' } })
        .run();
      inference.backend = 'cpu';
    }

    set({ models, activeModelId: active?.id ?? null, inference, unavailableBackends, modelsHydrated: true });
  },

  async addCustomModel(name, downloadUrl, knownSizeBytes = null) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const filename =
      downloadUrl.split("/").pop()?.split("?")[0] ?? "model.litertlm";

    // The catalogue already carries the exact blob size; only fall back to a
    // HEAD probe for a model that arrived some other way.
    let sizeBytes: number | null = knownSizeBytes;
    if (sizeBytes == null) {
      try {
        const res = await fetch(downloadUrl, { method: "HEAD" });
        const cl = res.headers.get("content-length");
        if (cl) sizeBytes = parseInt(cl, 10);
      } catch {}
    }

    db.insert(localModels)
      .values({
        id,
        name,
        filename,
        filePath: null,
        downloadUrl,
        sizeBytes,
        isDownloaded: 0,
        isActive: 0,
        downloadedAt: null,
      })
      .run();
    await get().loadModels();
  },

  async setActiveModel(id) {
    db.update(localModels).set({ isActive: 0 }).run();
    db.update(localModels)
      .set({ isActive: 1 })
      .where(eq(localModels.id, id))
      .run();
    set((s) => ({
      activeModelId: id,
      models: s.models.map((m) => ({ ...m, isActive: m.id === id })),
    }));

    if (Inference.isModelLoaded()) {
      await Inference.unloadModel();
      set({ isLoaded: false });
    }
  },

  async downloadModel(id) {
    const model = get().models.find((m) => m.id === id);
    if (!model) return;

    // Check free disk space first
    const freeSpace = await getFreeDiskStorageAsync();
    const required = model.sizeBytes ?? 0;
    if (required > 0 && freeSpace < required * 1.1) {
      set({
        loadError: `Not enough storage. ${formatBytes(required)} required, ${formatBytes(freeSpace)} free.`,
      });
      return;
    }

    await ensureModelsDir();
    const destPath = modelFilePath(model.filename);

    const resumable = createDownloadResumable(
      model.downloadUrl,
      destPath,
      {},
      (progress: DownloadProgressData) => {
        const ratio =
          progress.totalBytesExpectedToWrite > 0
            ? progress.totalBytesWritten / progress.totalBytesExpectedToWrite
            : 0;
        set((s) => ({
          downloadProgress: { ...s.downloadProgress, [id]: ratio },
        }));
      },
    );

    set((s) => ({
      downloadResumables: { ...s.downloadResumables, [id]: resumable },
      downloadProgress: { ...s.downloadProgress, [id]: 0 },
      loadError: null,
    }));

    try {
      const result = await resumable.downloadAsync();
      if (!result) throw new Error("Download cancelled");

      // `downloadAsync` resolves on any response it managed to write, including
      // a 401 from a gated repo, whose body then sits on disk wearing the
      // model's filename. The status is the first thing that catches that.
      if (result.status < 200 || result.status >= 300) {
        throw new DownloadRejected(result.status);
      }

      // And the second: a file that is not a model, whatever the status said.
      const check = await verifyModelFile(destPath);
      if (!check.ok) throw new DownloadRejected(result.status, check.serverMessage);

      // Always the size that actually landed. Trusting the catalogue's figure
      // is how a 137-byte error page displayed as "584 MB, downloaded".
      const resolvedSize = check.sizeBytes;

      // Probe model capabilities from the downloaded file
      let supportsSpec = false;
      try {
        const probe = createLLM();
        const caps = probe.checkModelCapabilities(destPath);
        supportsSpec = caps.supportsSpeculativeDecoding;
      } catch { /* non-critical — default to false */ }

      // Capabilities from the model's own chat template, not its filename.
      //
      // The filename guess this replaces matched "gemma-4" and treated
      // everything else as incapable, which was wrong for most of the
      // catalogue: Qwen3 reasons and calls tools, Qwen2.5 calls tools,
      // DeepSeek-R1 reasons. Reading the template asks the thing that actually
      // decides. Undetectable is not fatal — the flags fall back to off and the
      // reasoning stripper on the display side covers what they miss.
      const repoId = repoIdFromUrl(model.downloadUrl);
      const caps = repoId ? await detectCapabilities(repoId) : UNKNOWN_CAPABILITIES;
      const { supportsThinking, supportsToolCalling } = caps;

      const now = new Date().toISOString();
      db.update(localModels)
        .set({
          isDownloaded: 1,
          filePath: destPath,
          downloadedAt: now,
          sizeBytes: resolvedSize,
          supportsSpeculativeDecoding: supportsSpec ? 1 : 0,
          supportsThinking: supportsThinking ? 1 : 0,
          supportsToolCalling: supportsToolCalling ? 1 : 0,
        })
        .where(eq(localModels.id, id))
        .run();

      set((s) => ({
        models: s.models.map((m) =>
          m.id === id
            ? {
                ...m,
                isDownloaded: true,
                filePath: destPath,
                downloadedAt: now,
                sizeBytes: resolvedSize,
                supportsSpeculativeDecoding: supportsSpec,
                supportsThinking,
                supportsToolCalling,
              }
            : m,
        ),
        downloadProgress: Object.fromEntries(
          Object.entries(s.downloadProgress).filter(([k]) => k !== id),
        ),
        downloadResumables: Object.fromEntries(
          Object.entries(s.downloadResumables).filter(([k]) => k !== id),
        ),
      }));
    } catch (err: unknown) {
      try {
        await deleteAsync(destPath, { idempotent: true });
      } catch {}

      const msg = err instanceof Error ? err.message : "Download failed";
      const isStorageError =
        msg.includes("ERR_FILE_SYSTEM_WRITE") ||
        msg.includes("No space left") ||
        msg.includes("storage");

      set((s) => ({
        loadError:
          err instanceof DownloadRejected
            ? err.readerMessage()
            : isStorageError
              ? "Not enough storage to complete the download."
              : `Download failed: ${msg}`,
        downloadProgress: Object.fromEntries(
          Object.entries(s.downloadProgress).filter(([k]) => k !== id),
        ),
        downloadResumables: Object.fromEntries(
          Object.entries(s.downloadResumables).filter(([k]) => k !== id),
        ),
      }));
    }
  },

  cancelDownload(id) {
    const resumable = get().downloadResumables[id];
    if (resumable) {
      resumable.cancelAsync();
      set((s) => ({
        downloadProgress: Object.fromEntries(
          Object.entries(s.downloadProgress).filter(([k]) => k !== id),
        ),
        downloadResumables: Object.fromEntries(
          Object.entries(s.downloadResumables).filter(([k]) => k !== id),
        ),
      }));
    }
  },

  async deleteModel(id) {
    const model = get().models.find((m) => m.id === id);
    if (!model) return;

    // Unload first: the engine holds the model and its cache open while loaded.
    if (Inference.isModelLoaded() && get().activeModelId === id) {
      await Inference.unloadModel();
      set({ isLoaded: false });
    }

    if (model.filePath) await deleteModelFiles(model.filePath);

    db.delete(localModels).where(eq(localModels.id, id)).run();

    set((s) => ({
      models: s.models.filter((m) => m.id !== id),
      activeModelId: s.activeModelId === id ? null : s.activeModelId,
    }));
  },

  async initContext() {
    const { models, activeModelId } = get();
    const model = models.find((m) => m.id === activeModelId);
    if (!model?.filePath || !model.isDownloaded) {
      set({ loadError: "No downloaded model selected." });
      return;
    }

    if (!Inference.isNativeAvailable()) {
      set({ loadError: "AI chat isn't supported on this device." });
      return;
    }

    set({ isLoading: true, loadError: null, activeBackend: null });

    /*
     * Waking is measured in tens of seconds on a mid-range phone, and the
     * engine reports no progress while it does it, so the indicator has
     * nothing to count towards. Left alone that reads as a stall rather than
     * as work.
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
      const { inference } = get();
      // Clamp inference settings to what the model actually supports
      const effectiveInference: Inference.ModelSettings = {
        ...inference,
        enableSpeculativeDecoding: inference.enableSpeculativeDecoding && model.supportsSpeculativeDecoding,
        // Off, which is how Gemma was tested. Gemma honours this flag: turned on,
        // its reasoning pushed time to first token past two minutes on a 5.3 GB
        // phone and spent the context budget, so a tool result no longer fitted
        // and the turn stopped at the device-limit banner. A model that reasons
        // regardless still has its `<think>` blocks split out for display.
        enableThinking: false,
        enableToolCalling: inference.enableToolCalling && model.supportsToolCalling,
      };

      // Crash barrier: set flag BEFORE attempting non-CPU backend.
      // If Engine() causes SIGSEGV, next startup detects the flag and
      // permanently disables this backend.
      if (inference.backend !== 'cpu') {
        db.insert(appSettings)
          .values({ key: 'device.attemptingBackend', value: inference.backend })
          .onConflictDoUpdate({ target: appSettings.key, set: { value: inference.backend } })
          .run();
      }

      await Inference.loadModel(model.filePath, effectiveInference);

      // Engine loaded successfully — clear the crash barrier flag
      db.delete(appSettings).where(eq(appSettings.key, 'device.attemptingBackend')).run();

      const activeBackend = Inference.getActiveBackend() ?? inference.backend;

      // If the engine fell back to a different backend, mark the requested one
      // as unavailable permanently (hardware won't change) and switch the
      // setting to what's actually running.
      const { unavailableBackends } = get();
      if (activeBackend !== inference.backend) {
        const updated = new Set(unavailableBackends);
        updated.add(inference.backend);
        // Persist to DB so it survives app restarts
        db.insert(appSettings)
          .values({ key: 'device.unavailableBackends', value: [...updated].join(',') })
          .onConflictDoUpdate({ target: appSettings.key, set: { value: [...updated].join(',') } })
          .run();
        set({ unavailableBackends: updated, inference: { ...inference, backend: activeBackend } });
      }

      // No warmup turn here, deliberately.
      //
      // There used to be one: send "hi", await the whole reply, then
      // `resetConversation()`. On a mid-range device that cost two to three
      // minutes of a pulsing, unusable Samwell, and it bought nothing —
      // `resetConversation()` builds a fresh conversation with a fresh KV
      // cache, so the very thing the turn was meant to pre-allocate was
      // thrown away on the next line. What genuinely survives (weights paged
      // in, kernels compiled into `cacheDir`) is paid for by the first real
      // message anyway, and at least that one is a message the reader asked
      // for.
      clearTimeout(slowWakeNotice);
      set({ isLoaded: true, isLoading: false, activeBackend });
    } catch (err: unknown) {
      clearTimeout(slowWakeNotice);
      const msg = err instanceof Error ? err.message : "Failed to load model";
      const lower = msg.toLowerCase();
      const isOom =
        lower.includes("out of memory") ||
        lower.includes("oom") ||
        lower.includes("alloc");
      // The engine's own words for "this is not a model file". The repair pass
      // in loadModels clears the bad file, so the fix really is to download
      // again rather than to try a different setting.
      const isCorrupt =
        lower.includes("invalid magic number") || lower.includes("failed to open litert-lm file");
      set({
        isLoading: false,
        isLoaded: false,
        loadError: isOom
          ? "Model is too large for this device. Try a smaller model."
          : isCorrupt
            ? "This model file is damaged. Delete it and download it again."
            : `Failed to load model: ${msg}`,
      });
    }
  },

  async releaseContext() {
    await Inference.unloadModel();
    set({ isLoaded: false, loadError: null, activeBackend: null });
  },

  async setInference(partial) {
    const merged = { ...get().inference, ...partial };
    set({ inference: merged });

    // Persist each setting
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
      const estimate = checkModelMemory(model.sizeBytes);
      set({ memoryEstimate: estimate });
    } catch {
      set({ memoryEstimate: null });
    }
  },
}));
