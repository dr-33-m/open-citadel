import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  dirs: {} as Record<string, string[]>,
  deleted: [] as string[],
}));

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  getInfoAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  readDirectoryAsync: vi.fn(async (dir: string) => {
    const names = fs.dirs[dir];
    if (!names) throw new Error('no such directory');
    return names;
  }),
  deleteAsync: vi.fn(async (path: string) => {
    fs.deleted.push(path);
  }),
}));

import { deleteModelFiles } from '../model-file';

const MODELS = 'file:///docs/litert-models/';

describe('deleteModelFiles', () => {
  beforeEach(() => {
    fs.deleted = [];
    fs.dirs = {};
  });

  it('removes the model and the caches the engine built beside it', async () => {
    fs.dirs[MODELS] = [
      'gemma-4-E2B-it.litertlm_1789550264_2588147712.xnnpack_cache',
      'gemma-4-E4B-it.litertlm',
      'gemma-4-E4B-it.litertlm_1789554338_3659530240.xnnpack_cache',
    ];

    await deleteModelFiles(MODELS + 'gemma-4-E2B-it.litertlm');

    expect(fs.deleted.sort()).toEqual([
      MODELS + 'gemma-4-E2B-it.litertlm',
      MODELS + 'gemma-4-E2B-it.litertlm_1789550264_2588147712.xnnpack_cache',
    ]);
  });

  it('removes the caches Android keeps in the app cache directory', async () => {
    fs.dirs[MODELS] = [];
    fs.dirs['file:///cache/'] = [
      'gemma-4-E2B-it.litertlm_1_2.xnnpack_cache',
      'litert_asset_abc.png',
    ];

    await deleteModelFiles(MODELS + 'gemma-4-E2B-it.litertlm');

    expect(fs.deleted).toContain('file:///cache/gemma-4-E2B-it.litertlm_1_2.xnnpack_cache');
    expect(fs.deleted).not.toContain('file:///cache/litert_asset_abc.png');
  });

  it('keeps another model whose name starts with this one', async () => {
    fs.dirs[MODELS] = ['gemma.litertlm_v2.litertlm'];

    await deleteModelFiles(MODELS + 'gemma.litertlm');

    expect(fs.deleted).toEqual([MODELS + 'gemma.litertlm']);
  });

  it('still removes the model when a directory cannot be listed', async () => {
    await deleteModelFiles(MODELS + 'gemma.litertlm');

    expect(fs.deleted).toEqual([MODELS + 'gemma.litertlm']);
  });
});
