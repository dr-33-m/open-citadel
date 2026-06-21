import * as Device from 'expo-device';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { loadLlamaModelInfo } from 'llama.rn';

export type MemoryStatus = 'fits' | 'tight' | 'wont_fit';

export interface MemoryEstimate {
  estimatedBytes: number;
  availableBytes: number;
  totalBytes: number;
  status: MemoryStatus;
}

/**
 * Read available memory from /proc/meminfo on Android.
 * Falls back to a conservative estimate on iOS or if the read fails.
 */
async function getAvailableMemory(totalBytes: number): Promise<number> {
  if (Platform.OS === 'android') {
    try {
      const content = await readAsStringAsync('/proc/meminfo');
      const match = content.match(/MemAvailable:\s+(\d+)\s+kB/);
      if (match) return parseInt(match[1], 10) * 1024;
    } catch {}
  }
  // Fallback: min(60% of total, total - 1.2 GB)
  const ceiling = Math.min(totalBytes * 0.6, totalBytes - 1.2 * 1024 * 1024 * 1024);
  return Math.max(ceiling, 0);
}

/**
 * Estimate how much RAM a model will actually use when loaded,
 * based on GGUF metadata (weights + KV cache + compute buffer + 10% overhead).
 */
async function estimateModelRam(
  filePath: string,
  fileSizeBytes: number,
  contextSize: number,
): Promise<number> {
  try {
    const meta = (await loadLlamaModelInfo(filePath)) as Record<string, unknown>;
    const arch = (meta['general.architecture'] as string) ?? '';
    if (!arch) return fileSizeBytes * 1.2;

    const num = (key: string): number => {
      const v = meta[`${arch}.${key}`];
      const n = Number(v);
      return !isNaN(n) ? n : 0;
    };

    const n_layers = num('block_count');
    const n_embd = num('embedding_length');
    const n_head = num('attention.head_count') || 1;
    const n_head_kv = num('attention.head_count_kv') || n_head;
    const n_embd_head_k = num('attention.key_length') || Math.floor(n_embd / n_head);
    const n_embd_head_v = num('attention.value_length') || Math.floor(n_embd / n_head);
    // Vocab size is rarely in GGUF metadata (llama.rn skips tokenizer data).
    // Default 128K covers most modern LLMs (32K–256K range).
    // Overestimating is safer than underestimating for memory checks.
    const n_vocab = num('vocab_size') || 128000;
    const sliding_window = num('attention.sliding_window');

    // If critical params are missing, fall back
    if (!n_layers || !n_embd) return fileSizeBytes * 1.2;

    const effectiveCtx =
      sliding_window > 0 ? Math.min(contextSize, sliding_window) : contextSize;

    // KV cache: f16 (2 bytes per element) is the default
    const bytesPerElem = 2;
    const kvCache =
      n_layers * effectiveCtx * (n_embd_head_k + n_embd_head_v) * n_head_kv * bytesPerElem;

    // Compute buffer: llama.cpp allocates logits (vocab * batch * float),
    // FFN intermediates, attention scores, and graph scratch buffers.
    // Large-vocab models (Qwen 151K, Gemma 256K) need significantly more.
    const n_ubatch = 512;
    const logitsBuffer = n_vocab * n_ubatch * 4;
    const ffnBuffer = n_embd * 4 * n_ubatch * 4; // FFN hidden dim ≈ 4x embd
    const computeBuffer = logitsBuffer + ffnBuffer;

    // 1.5x overhead covers mmap pressure, scratch allocations, attention/FFN
    // intermediate tensors, graph eval buffers. Validated against real crashes:
    // a 2GB Qwen 3B (151K vocab) needs >3.2GB actual RAM.
    const total = (fileSizeBytes + kvCache + computeBuffer) * 1.5;

    console.log(
      `[MemoryEstimator] ${arch}: layers=${n_layers} embd=${n_embd} heads=${n_head}/${n_head_kv} ` +
        `ctx=${effectiveCtx} kvCache=${(kvCache / 1024 / 1024).toFixed(0)}MB ` +
        `compute=${(computeBuffer / 1024 / 1024).toFixed(0)}MB ` +
        `total=${(total / 1024 / 1024).toFixed(0)}MB`,
    );

    return total;
  } catch (err) {
    console.warn('[MemoryEstimator] Failed to parse GGUF metadata, using fallback:', err);
    return fileSizeBytes * 1.2;
  }
}

/**
 * Check whether a model is likely to fit in memory.
 * Returns estimated RAM needed, available RAM, and a three-level status.
 */
export async function checkModelMemory(
  filePath: string,
  fileSizeBytes: number,
  contextSize: number,
): Promise<MemoryEstimate> {
  const totalBytes = Device.totalMemory ?? 0;

  const [estimatedBytes, availableBytes] = await Promise.all([
    estimateModelRam(filePath, fileSizeBytes, contextSize),
    getAvailableMemory(totalBytes),
  ]);

  let status: MemoryStatus;
  if (estimatedBytes <= availableBytes) status = 'fits';
  else if (estimatedBytes <= totalBytes) status = 'tight';
  else status = 'wont_fit';

  console.log(
    `[MemoryEstimator] estimated=${(estimatedBytes / 1024 / 1024).toFixed(0)}MB ` +
      `available=${(availableBytes / 1024 / 1024).toFixed(0)}MB ` +
      `total=${(totalBytes / 1024 / 1024).toFixed(0)}MB → ${status}`,
  );

  return { estimatedBytes, availableBytes, totalBytes, status };
}
