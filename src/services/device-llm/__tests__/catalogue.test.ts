import { beforeEach, describe, expect, it, vi } from 'vitest';

let backends: string[] = [];

const variant = (family: string, name: string) => ({
  modelPath: `${family}/${name}.pte`,
  tokenizerPath: `${family}/tokenizer.json`,
  tokenizerConfigPath: `${family}/tokenizer_config.json`,
});

vi.mock('@/lib/executorch', () => ({
  getExecuTorch: () => ({
    getRegisteredBackends: () => backends,
    models: {
      llm: {
        QWEN3_1_7B: { XNNPACK_8DA4W: variant('qwen3', 'cpu'), MLX_INT4: variant('qwen3', 'mlx') },
        GEMMA4_E2B: { XNNPACK_8DA4W: variant('gemma4', 'cpu'), MLX_INT4: variant('gemma4', 'mlx') },
      },
    },
  }),
}));

async function load() {
  // `runsOnMetal` asks the runtime once per process; a fresh module per case.
  vi.resetModules();
  return import('../catalogue');
}

describe('registryModel', () => {
  beforeEach(() => {
    backends = [];
  });

  it('runs the Metal export where the MLX backend is registered', async () => {
    backends = ['XnnpackBackend', 'MLXBackend'];
    const { catalogueModel, registryModel } = await load();
    expect(registryModel(catalogueModel('qwen-3-1.7b')!)?.modelPath).toBe('qwen3/mlx.pte');
  });

  it('runs the CPU export without it: Android, and the iOS simulator', async () => {
    backends = ['XnnpackBackend'];
    const { catalogueModel, registryModel } = await load();
    expect(registryModel(catalogueModel('qwen-3-1.7b')!)?.modelPath).toBe('qwen3/cpu.pte');
  });

  it('keeps Gemma on CPU even with Metal, where its window holds the tools', async () => {
    backends = ['XnnpackBackend', 'MLXBackend'];
    const { catalogueModel, registryModel } = await load();
    expect(registryModel(catalogueModel('gemma-4-e2b')!)?.modelPath).toBe('gemma4/cpu.pte');
  });
});

describe('DEVICE_CATALOGUE', () => {
  it('offers Metal only where the export keeps the CPU window', async () => {
    const { DEVICE_CATALOGUE } = await load();
    const onMetal = DEVICE_CATALOGUE.filter((m) => m.metal).map((m) => m.id);
    // Gemma 4 (2048 at 64 tokens a call, against 4048) and LFM 2.5 (a
    // 65-token cache) have Metal exports that are worse than their CPU ones.
    expect(onMetal.some((id) => id.startsWith('gemma') || id.startsWith('lfm'))).toBe(false);
    expect(onMetal).toHaveLength(12);
  });
});
