/**
 * The brains Samwell can run on the device, drawn from ExecuTorch's registry.
 *
 * The registry is the source of every URL: a model, its tokenizer and its chat
 * template, versioned together and published by the library's maintainers as
 * tested exports. This list only chooses which of them to offer, and says what
 * the registry cannot: a name worth reading, and whether we can read the
 * model's tool calls.
 *
 * Every entry has a CPU (XNNPACK) export, which runs everywhere. Where the
 * registry also has a Metal (MLX) export with the same window, an iPhone runs
 * that one on its GPU instead (`metal`): the maintainers only publish an MLX
 * export once a model runs better there. The registry's own `DEFAULT` is not
 * used, because it would put Gemma on Vulkan or Metal and cost it its tools.
 * Two kinds of export are left out on purpose:
 *
 * - GPU exports that are smaller than the CPU one. Gemma 4 E2B on Vulkan holds
 *   2048 tokens with a 128-token cache and on MLX 2048 at 64 tokens a call,
 *   against 4048 on CPU, which is what fits Samwell's tools; LFM 2.5 on MLX has
 *   a 65-token cache. A cache shorter than the window is also one the runner
 *   does not guard against overflow.
 * - Exports whose prefill chunk is shorter than their cache (Llama 3.2 on CPU,
 *   2048 over 4096). The native runner only guards the cache's end when the
 *   two match, and an unguarded overflow is the process abort this runtime
 *   replaced.
 */

import type { LLMModel } from 'react-native-executorch';

import { getExecuTorch } from '@/lib/executorch';
import { GEMMA_TOOL_FORMAT, type ToolFormat } from '@/services/device-llm/tool-format';

type LLMRegistry = NonNullable<ReturnType<typeof getExecuTorch>>['models']['llm'];

/** A family in the registry and its exports, checked against the registry's own keys. */
type RegistryRef = {
  [F in keyof LLMRegistry]: {
    family: F;
    /** The CPU export: every platform, and the fallback wherever Metal is not. */
    variant: Exclude<keyof LLMRegistry[F], 'DEFAULT'>;
    /** The Metal export, for an iPhone whose binary carries the MLX backend. */
    metal?: Exclude<keyof LLMRegistry[F], 'DEFAULT'>;
  };
}[keyof LLMRegistry];

export type CatalogueModel = RegistryRef & {
  /** Stable, and stored: never rename one. */
  id: string;
  name: string;
  /** Present when we can read this family's tool calls. */
  toolFormat?: ToolFormat;
  /** Reasons in `<think>` blocks before it answers. */
  reasons?: boolean;
  /** The brain the app points readers to first. */
  recommended?: boolean;
};

export const DEVICE_CATALOGUE: readonly CatalogueModel[] = [
  {
    id: 'gemma-4-e2b',
    name: 'Gemma 4 E2B',
    family: 'GEMMA4_E2B',
    variant: 'XNNPACK_8DA4W',
    toolFormat: GEMMA_TOOL_FORMAT,
    recommended: true,
  },
  { id: 'qwen-3-0.6b', name: 'Qwen 3 0.6B', family: 'QWEN3_0_6B', variant: 'XNNPACK_8DA4W', metal: 'MLX_INT4', reasons: true },
  { id: 'qwen-3-1.7b', name: 'Qwen 3 1.7B', family: 'QWEN3_1_7B', variant: 'XNNPACK_8DA4W', metal: 'MLX_INT4', reasons: true },
  { id: 'qwen-3-4b', name: 'Qwen 3 4B', family: 'QWEN3_4B', variant: 'XNNPACK_8DA4W', metal: 'MLX_INT4', reasons: true },
  { id: 'qwen-2.5-0.5b', name: 'Qwen 2.5 0.5B', family: 'QWEN2_5_0_5B', variant: 'XNNPACK_8DA4W', metal: 'MLX_INT4' },
  { id: 'qwen-2.5-1.5b', name: 'Qwen 2.5 1.5B', family: 'QWEN2_5_1_5B', variant: 'XNNPACK_8DA4W', metal: 'MLX_INT4' },
  { id: 'qwen-2.5-3b', name: 'Qwen 2.5 3B', family: 'QWEN2_5_3B', variant: 'XNNPACK_8DA4W', metal: 'MLX_INT4' },
  { id: 'lfm-2.5-350m', name: 'LFM 2.5 350M', family: 'LFM2_5_350M', variant: 'XNNPACK_8DA4W' },
  { id: 'lfm-2.5-1.2b', name: 'LFM 2.5 1.2B', family: 'LFM2_5_1_2B', variant: 'XNNPACK_8DA4W' },
  { id: 'smollm2-135m', name: 'SmolLM2 135M', family: 'SMOLLM2_135M', variant: 'XNNPACK_8DA8W', metal: 'MLX_INT8' },
  { id: 'smollm2-360m', name: 'SmolLM2 360M', family: 'SMOLLM2_360M', variant: 'XNNPACK_8DA8W', metal: 'MLX_INT8' },
  { id: 'smollm2-1.7b', name: 'SmolLM2 1.7B', family: 'SMOLLM2_1_7B', variant: 'XNNPACK_8DA8W', metal: 'MLX_INT8' },
  { id: 'hammer-2.1-0.5b', name: 'Hammer 2.1 0.5B', family: 'HAMMER2_1_0_5B', variant: 'XNNPACK_8DA4W', metal: 'MLX_INT4' },
  { id: 'hammer-2.1-1.5b', name: 'Hammer 2.1 1.5B', family: 'HAMMER2_1_1_5B', variant: 'XNNPACK_8DA4W', metal: 'MLX_INT4' },
  { id: 'hammer-2.1-3b', name: 'Hammer 2.1 3B', family: 'HAMMER2_1_3B', variant: 'XNNPACK_8DA4W', metal: 'MLX_INT4' },
];

export function catalogueModel(id: string | null | undefined): CatalogueModel | undefined {
  return id ? DEVICE_CATALOGUE.find((m) => m.id === id) : undefined;
}

let metal: boolean | null = null;

/**
 * Whether this binary can run a Metal export: the MLX backend is linked and
 * registered. Only an iPhone build has it. The simulator cannot drive MLX and
 * is built without it, as Android always is, so both answer false here and run
 * the CPU export.
 */
export function runsOnMetal(): boolean {
  if (metal === null) {
    const et = getExecuTorch();
    metal = !!et && et.getRegisteredBackends().some((name) => /mlx/i.test(name));
  }
  return metal;
}

/**
 * The registry's remote files for an entry on this device, or null when the
 * runtime is not in this binary. Resolved on demand so the registry is only
 * built once needed.
 */
export function registryModel(entry: CatalogueModel): LLMModel | null {
  const et = getExecuTorch();
  if (!et) return null;
  const family = et.models.llm[entry.family] as Record<string, LLMModel>;
  const variant = entry.metal && runsOnMetal() ? entry.metal : entry.variant;
  return family[variant] ?? null;
}
