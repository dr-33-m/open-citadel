import * as Device from "expo-device";
import { eq } from "drizzle-orm";
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
import { checkModelMemory, type MemoryEstimate } from "@/utils/memory-estimator";

export interface InferenceSettings {
  contextSize: number;
  backend: Backend;
  enableSpeculativeDecoding: boolean;
  enableThinking: boolean;
  enableToolCalling: boolean;
}

export interface LocalModel {
  id: string;
  name: string;
  filename: string;
  filePath: string | null;
  downloadUrl: string;
  sizeBytes: number | null;
  minDeviceMemoryGb: number | null;
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
  enableThinking: false,
  enableToolCalling: true,
};

interface ModelStore {
  models: LocalModel[];
  activeModelId: string | null;
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
  addCustomModel(name: string, downloadUrl: string): Promise<void>;
  downloadModel(id: string): Promise<void>;
  cancelDownload(id: string): void;
  deleteModel(id: string): Promise<void>;
  initContext(): Promise<void>;
  releaseContext(): Promise<void>;
  setInference(settings: Partial<InferenceSettings>): Promise<void>;
  checkMemory(modelId: string): Promise<void>;
}

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
    minDeviceMemoryGb: 8,
    supportsSpeculativeDecoding: true,
    supportsThinking: true,
    supportsToolCalling: true,
  },
  {
    id: "gemma3-1b-it",
    name: "Gemma 3 1B",
    filename: "Gemma3-1B-IT_multi-prefill-seq_q4_ekv4096.litertlm",
    downloadUrl:
      "https://huggingface.co/litert-community/Gemma3-1B-IT/resolve/main/Gemma3-1B-IT_multi-prefill-seq_q4_ekv4096.litertlm",
    sizeBytes: 584 * 1024 * 1024,
    minDeviceMemoryGb: 6,
    supportsSpeculativeDecoding: false,
    supportsThinking: false,
    supportsToolCalling: false,
  },
  {
    id: "qwen2.5-1.5b-instruct",
    name: "Qwen 2.5 1.5B",
    filename: "Qwen2.5-1.5B-Instruct_multi-prefill-seq_q8_ekv4096.litertlm",
    downloadUrl:
      "https://huggingface.co/litert-community/Qwen2.5-1.5B-Instruct/resolve/main/Qwen2.5-1.5B-Instruct_multi-prefill-seq_q8_ekv4096.litertlm",
    sizeBytes: 1598 * 1024 * 1024,
    minDeviceMemoryGb: 6,
    supportsSpeculativeDecoding: false,
    supportsThinking: false,
    supportsToolCalling: false,
  },
  {
    id: "deepseek-r1-distill-qwen-1.5b",
    name: "DeepSeek-R1 Distill Qwen 1.5B",
    filename: "DeepSeek-R1-Distill-Qwen-1.5B_multi-prefill-seq_q8_ekv4096.litertlm",
    downloadUrl:
      "https://huggingface.co/litert-community/DeepSeek-R1-Distill-Qwen-1.5B/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B_multi-prefill-seq_q8_ekv4096.litertlm",
    sizeBytes: 1833 * 1024 * 1024,
    minDeviceMemoryGb: 6,
    supportsSpeculativeDecoding: false,
    supportsThinking: false,
    supportsToolCalling: false,
  },
];

function modelsDir(): string {
  return (documentDirectory ?? "") + "litert-models/";
}

function modelFilePath(filename: string): string {
  return modelsDir() + filename;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

async function ensureModelsDir() {
  const dir = modelsDir();
  const info = await getInfoAsync(dir);
  if (!info.exists) await makeDirectoryAsync(dir, { intermediates: true });
}

export const useModelStore = create<ModelStore>((set, get) => ({
  models: [],
  activeModelId: null,
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

    const rows = db.select().from(localModels).all();
    const models: LocalModel[] = rows.map((r) => {
      // Look up minDeviceMemoryGb from seed data if available
      const seed = SEED_MODELS.find((s) => s.id === r.id);
      return {
        id: r.id,
        name: r.name,
        filename: r.filename,
        filePath: r.filePath ?? null,
        downloadUrl: r.downloadUrl,
        sizeBytes: r.sizeBytes ?? null,
        minDeviceMemoryGb: seed?.minDeviceMemoryGb ?? null,
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
      enableThinking: settingsMap['inference.enableThinking'] === 'true',
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

    set({ models, activeModelId: active?.id ?? null, inference, unavailableBackends });
  },

  async addCustomModel(name, downloadUrl) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const filename =
      downloadUrl.split("/").pop()?.split("?")[0] ?? "model.litertlm";

    // Best-effort: fetch Content-Length so we can show size before download
    let sizeBytes: number | null = null;
    try {
      const res = await fetch(downloadUrl, { method: "HEAD" });
      const cl = res.headers.get("content-length");
      if (cl) sizeBytes = parseInt(cl, 10);
    } catch {}

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
        loadError: `Not enough storage — ${formatBytes(required)} required, ${formatBytes(freeSpace)} free.`,
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

      // Fill in size from file stat if not already known
      let resolvedSize = model.sizeBytes;
      if (!resolvedSize) {
        try {
          const info = await getInfoAsync(destPath);
          if (info.exists && !info.isDirectory)
            resolvedSize = (info as { size: number }).size ?? null;
        } catch {}
      }

      // Probe model capabilities from the downloaded file
      let supportsSpec = false;
      try {
        const probe = createLLM();
        const caps = probe.checkModelCapabilities(destPath);
        supportsSpec = caps.supportsSpeculativeDecoding;
      } catch { /* non-critical — default to false */ }

      // Heuristic: thinking and tool calling support based on model name
      const nameLower = model.name.toLowerCase() + ' ' + model.filename.toLowerCase();
      const supportsThinking = nameLower.includes('gemma-4') || nameLower.includes('gemma4');
      const supportsToolCalling = supportsThinking || nameLower.includes('3n') || nameLower.includes('gemma3');

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
        loadError: isStorageError
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

    if (model.filePath) {
      try {
        await deleteAsync(model.filePath, { idempotent: true });
      } catch {}
    }

    if (Inference.isModelLoaded() && get().activeModelId === id) {
      await Inference.unloadModel();
      set({ isLoaded: false });
    }

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

    set({ isLoading: true, loadError: null, activeBackend: null });
    try {
      const { inference } = get();
      // Clamp inference settings to what the model actually supports
      const effectiveInference: Inference.ModelSettings = {
        ...inference,
        enableSpeculativeDecoding: inference.enableSpeculativeDecoding && model.supportsSpeculativeDecoding,
        enableThinking: inference.enableThinking && model.supportsThinking,
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

      // Warmup inference — pre-allocate KV cache so the user's first real
      // message is fast. Gallery app uses a similar post-init delay.
      try {
        await Inference.chat('hi', () => {});
        Inference.resetConversation();
      } catch { /* non-critical */ }

      set({ isLoaded: true, isLoading: false, activeBackend });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load model";
      const isOom =
        msg.toLowerCase().includes("out of memory") ||
        msg.toLowerCase().includes("oom") ||
        msg.toLowerCase().includes("alloc");
      set({
        isLoading: false,
        isLoaded: false,
        loadError: isOom
          ? "Model is too large for this device. Try a smaller model."
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
      const estimate = checkModelMemory(model.minDeviceMemoryGb);
      set({ memoryEstimate: estimate });
    } catch {
      set({ memoryEstimate: null });
    }
  },
}));
