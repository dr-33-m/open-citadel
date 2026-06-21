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
import { appSettings, llamaModels } from "@/db/schema";
import { getBackendDevicesInfo } from "llama.rn";
import * as LlamaService from "@/services/llama-service";
import { checkModelMemory, type MemoryEstimate } from "@/utils/memory-estimator";

export interface InferenceSettings {
  contextSize: number;   // n_ctx: 2048 | 4096 | 8192
  cpuThreads: number;    // n_threads: 2–8
  gpuLayers: number;     // n_gpu_layers: 0 = CPU only, 99 = all on GPU
}

export interface LlamaModel {
  id: string;
  name: string;
  filename: string;
  filePath: string | null;
  downloadUrl: string;
  sizeBytes: number | null;
  isDownloaded: boolean;
  isActive: boolean;
  downloadedAt: string | null;
}

const DEFAULT_INFERENCE: InferenceSettings = {
  contextSize: 2048,
  cpuThreads: 4,
  gpuLayers: 99,
};

interface LlamaStore {
  models: LlamaModel[];
  activeModelId: string | null;
  isLoaded: boolean;
  isLoading: boolean;
  loadError: string | null;
  downloadProgress: Record<string, number>; // modelId → 0–1
  downloadResumables: Record<string, DownloadResumable>;
  inference: InferenceSettings;
  deviceTotalMemory: number | null;
  memoryEstimate: MemoryEstimate | null;
  hasGpu: boolean;

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
  LlamaModel,
  "isDownloaded" | "isActive" | "filePath" | "downloadedAt"
>[] = [
  {
    id: "llama-3.2-1b-q4",
    name: "Llama 3.2 1B Instruct",
    filename: "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    downloadUrl:
      "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    sizeBytes: 770 * 1024 * 1024,
  },
  {
    id: "qwen2.5-1.5b-q4",
    name: "Qwen 2.5 1.5B Instruct",
    filename: "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
    downloadUrl:
      "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
    sizeBytes: 1010 * 1024 * 1024,
  },
  {
    id: 'DeepSeek-R1-Distill-Qwen-1.5B-Q2_K_L',
    name:"DeepSeek-R1 Distill Qwen-1.5B",
    filename: "DeepSeek-R1-Distill-Qwen-1.5B-Q2_K_L.gguf",
    downloadUrl: "https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q2_K_L.gguf",
    sizeBytes: 808 * 1024 * 1024,
  },
  {
    id: "gemma-4-E2B-it-UD-IQ2_M",
    name: "Gemma 4 E2B",
    filename: "gemma-4-E2B-it-UD-IQ2_M.gguf",
    downloadUrl: "https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-UD-IQ2_M.gguf",
    sizeBytes: 2345 * 1024 * 1024,
  }
];

function modelsDir(): string {
  return (documentDirectory ?? "") + "llama-models/";
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

export const useLlamaStore = create<LlamaStore>((set, get) => ({
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
  hasGpu: false,

  async loadModels() {
    // Seed default models on first launch
    const existing = db.select().from(llamaModels).all();
    if (existing.length === 0) {
      for (const m of SEED_MODELS) {
        db.insert(llamaModels)
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

    const rows = db.select().from(llamaModels).all();
    const models: LlamaModel[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      filename: r.filename,
      filePath: r.filePath ?? null,
      downloadUrl: r.downloadUrl,
      sizeBytes: r.sizeBytes ?? null,
      isDownloaded: r.isDownloaded === 1,
      isActive: r.isActive === 1,
      downloadedAt: r.downloadedAt ?? null,
    }));

    const active = models.find((m) => m.isActive);

    // Load persisted inference settings
    const settingsRows = db.select().from(appSettings).all();
    const settingsMap = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
    const inference: InferenceSettings = {
      contextSize: parseInt(settingsMap['inference.contextSize'] ?? String(DEFAULT_INFERENCE.contextSize), 10),
      cpuThreads: parseInt(settingsMap['inference.cpuThreads'] ?? String(DEFAULT_INFERENCE.cpuThreads), 10),
      gpuLayers: parseInt(settingsMap['inference.gpuLayers'] ?? String(DEFAULT_INFERENCE.gpuLayers), 10),
    };

    // Detect GPU support — check both type and backend name
    const GPU_BACKENDS = ['opencl', 'vulkan', 'metal', 'cuda', 'gpu'];
    let hasGpu = false;
    try {
      const devices = await getBackendDevicesInfo();
      hasGpu = devices.some((d) =>
        GPU_BACKENDS.some((g) => d.type.toLowerCase().includes(g) || d.backend.toLowerCase().includes(g)),
      );
    } catch {}

    set({ models, activeModelId: active?.id ?? null, inference, hasGpu });
  },

  async addCustomModel(name, downloadUrl) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const filename =
      downloadUrl.split("/").pop()?.split("?")[0] ?? "model.gguf";

    // Best-effort: fetch Content-Length so we can show size before download
    let sizeBytes: number | null = null;
    try {
      const res = await fetch(downloadUrl, { method: "HEAD" });
      const cl = res.headers.get("content-length");
      if (cl) sizeBytes = parseInt(cl, 10);
    } catch {}

    db.insert(llamaModels)
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
    db.update(llamaModels).set({ isActive: 0 }).run();
    db.update(llamaModels)
      .set({ isActive: 1 })
      .where(eq(llamaModels.id, id))
      .run();
    set((s) => ({
      activeModelId: id,
      models: s.models.map((m) => ({ ...m, isActive: m.id === id })),
    }));

    if (LlamaService.isModelLoaded()) {
      await LlamaService.unloadModel();
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

      const now = new Date().toISOString();
      db.update(llamaModels)
        .set({
          isDownloaded: 1,
          filePath: destPath,
          downloadedAt: now,
          sizeBytes: resolvedSize,
        })
        .where(eq(llamaModels.id, id))
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

    if (LlamaService.isModelLoaded() && get().activeModelId === id) {
      await LlamaService.unloadModel();
      set({ isLoaded: false });
    }

    db.delete(llamaModels).where(eq(llamaModels.id, id)).run();

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

    set({ isLoading: true, loadError: null });
    try {
      const { inference } = get();
      await LlamaService.loadModel(model.filePath, inference);
      set({ isLoaded: true, isLoading: false });
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
    await LlamaService.unloadModel();
    set({ isLoaded: false, loadError: null });
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
    if (!model?.filePath || !model.isDownloaded || !model.sizeBytes) {
      set({ memoryEstimate: null });
      return;
    }
    try {
      const estimate = await checkModelMemory(
        model.filePath,
        model.sizeBytes,
        get().inference.contextSize,
      );
      set({ memoryEstimate: estimate });
    } catch {
      set({ memoryEstimate: null });
    }
  },
}));
