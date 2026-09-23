import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWithTimeout = vi.fn();
vi.mock('@/utils/fetch-timeout', () => ({ fetchWithTimeout: (url: string) => fetchWithTimeout(url) }));

const { parseHFUrl, totalSizeBytes } = await import('../huggingface');

const BASE = 'https://huggingface.co/software-mansion/react-native-executorch-gemma-4/resolve/v0.10.0';

function answer(siblings: { rfilename: string; size?: number }[]) {
  return { ok: true, status: 200, json: async () => ({ siblings }) };
}

describe('parseHFUrl', () => {
  it('reads the repo, the revision and the path', () => {
    expect(parseHFUrl(`${BASE}/e2b/xnnpack/model.pte`)).toEqual({
      repo: 'software-mansion/react-native-executorch-gemma-4',
      revision: 'v0.10.0',
      path: 'e2b/xnnpack/model.pte',
    });
  });

  it('ignores a query string', () => {
    expect(parseHFUrl(`${BASE}/tokenizer.json?download=true`)?.path).toBe('tokenizer.json');
  });

  it('returns null for a URL that is not a Hugging Face file', () => {
    expect(parseHFUrl('https://example.com/model.pte')).toBeNull();
  });
});

describe('totalSizeBytes', () => {
  beforeEach(() => fetchWithTimeout.mockReset());

  it('adds up every file, asking once per repo and revision', async () => {
    fetchWithTimeout.mockResolvedValue(
      answer([
        { rfilename: 'e2b/xnnpack/model.pte', size: 2_000 },
        { rfilename: 'e2b/tokenizer.json', size: 30 },
        { rfilename: 'e2b/tokenizer_config.json', size: 2 },
      ]),
    );
    const total = await totalSizeBytes([
      `${BASE}/e2b/xnnpack/model.pte`,
      `${BASE}/e2b/tokenizer.json`,
      `${BASE}/e2b/tokenizer_config.json`,
    ]);
    expect(total).toBe(2_032);
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(fetchWithTimeout.mock.calls[0][0]).toContain('/revision/v0.10.0?blobs=true');
  });

  it('gives no total when a file cannot be measured', async () => {
    // A total missing its largest file would pass a storage check it should fail.
    fetchWithTimeout.mockResolvedValue(answer([{ rfilename: 'other/tokenizer.json', size: 30 }]));
    expect(
      await totalSizeBytes([
        'https://huggingface.co/org/other/resolve/v1/other/model.pte',
        'https://huggingface.co/org/other/resolve/v1/other/tokenizer.json',
      ]),
    ).toBeNull();
  });

  it('asks again after a failure rather than remembering it', async () => {
    const url = 'https://huggingface.co/org/retry/resolve/v1/model.pte';
    fetchWithTimeout.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    await expect(totalSizeBytes([url])).rejects.toThrow('503');
    fetchWithTimeout.mockResolvedValueOnce(answer([{ rfilename: 'model.pte', size: 7 }]));
    expect(await totalSizeBytes([url])).toBe(7);
  });
});
