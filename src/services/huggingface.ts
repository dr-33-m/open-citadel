/**
 * The official LiteRT model catalogue — the network side of the model picker.
 *
 * Deliberately not a Hugging Face search box. Free-form search let readers
 * wander onto gated repos, and a gated repo does not fail honestly: the
 * download returns 401 with a short text body, `downloadAsync` writes that body
 * to disk under the model's name and reports success, and nothing notices until
 * the native loader rejects the magic number. `litert-community/Gemma3-1B-IT`
 * shipped in the seed list and did exactly that.
 *
 * So the picker only ever offers repos that are public, chat-capable and
 * actually ship a `.litertlm` file. One request gets all three facts, which is
 * why they are asked for together rather than probed per repo.
 *
 * Pure fetch and pure formatting: no React, no store. The picker sheet holds
 * the state machine; these are the moves it can make.
 */

import { fetchWithTimeout } from '@/utils/fetch-timeout';

const HF_API = 'https://huggingface.co/api';
const HF_RESOLVE = 'https://huggingface.co';

/** Google's org of LiteRT conversions. The only source the picker draws from. */
const OFFICIAL_AUTHOR = 'litert-community';

/**
 * Pipeline tags that mean "this model holds a conversation". `null` earns its
 * place: the whole Gemma 4 family is untagged, including the one model known
 * to run well here, so an allowlist that dropped it would be the wrong filter.
 * Everything else in the org is transcription, embeddings or image generation.
 */
const CHAT_PIPELINE_TAGS: readonly (string | null)[] = [
  null,
  'text-generation',
  'image-text-to-text',
];

export type HFRepo = {
  id: string;
  /** The repo half of the id, which is the part worth showing. */
  name: string;
  downloads: number;
  /** Parameter count in billions, read from the name. Null when unstated. */
  paramsB: number | null;
};

export type HFFile = { rfilename: string; size?: number };

type RawRepo = {
  id: string;
  gated?: boolean | string;
  downloads?: number;
  pipeline_tag?: string | null;
  siblings?: { rfilename: string }[];
};

function isLiteRt(filename: string): boolean {
  return filename.endsWith('.litertlm');
}

/**
 * Every model the picker is allowed to offer, most-downloaded first.
 *
 * `gated` is the load-bearing field. Hugging Face reports it as `false` for
 * open repos and as a truthy string ("auto", "manual") for ones that need an
 * accepted licence and a token, so this tests for exactly `false` rather than
 * for falsiness.
 */
export async function listOfficialModels(): Promise<HFRepo[]> {
  const params = new URLSearchParams({
    author: OFFICIAL_AUTHOR,
    limit: '300',
    sort: 'downloads',
  });
  for (const field of ['gated', 'downloads', 'pipeline_tag', 'siblings']) {
    params.append('expand[]', field);
  }

  const res = await fetchWithTimeout(`${HF_API}/models?${params}`);
  if (!res.ok) throw new Error(`Could not reach the model catalogue (${res.status}).`);

  const raw = (await res.json()) as RawRepo[];

  return raw
    .filter(
      (r) =>
        r.gated === false &&
        CHAT_PIPELINE_TAGS.includes(r.pipeline_tag ?? null) &&
        (r.siblings ?? []).some((s) => isLiteRt(s.rfilename)),
    )
    .map((r) => {
      const name = r.id.split('/')[1] ?? r.id;
      return { id: r.id, name, downloads: r.downloads ?? 0, paramsB: paramsBillions(name) };
    });
}

/**
 * Parameter count in billions, from a repo name like `Qwen3-14B` or
 * `gemma-4-26B-A4B-it`. The largest number wins, because a mixture-of-experts
 * name states both the total and the active count and it is the total that has
 * to be held in memory.
 *
 * Guessing anything from a name is usually a mistake, and this module removed
 * exactly that habit for capabilities. Size is the one case where it holds:
 * a parameter count is a statement of fact about the architecture, not an
 * inference about behaviour, and every repo in this catalogue states it.
 */
export function paramsBillions(name: string): number | null {
  const matches = [...name.matchAll(/(\d+(?:\.\d+)?)\s*B\b/gi)];
  if (matches.length === 0) return null;
  return Math.max(...matches.map((m) => parseFloat(m[1])));
}

/**
 * The smallest a model of this size could plausibly be on disk.
 *
 * Roughly half a byte per parameter, which is what aggressive 4-bit
 * quantisation reaches. Deliberately the optimistic end: this is used to rule
 * a repo out before its file sizes are known, so it must only exclude models
 * that cannot fit at any quantisation.
 */
export function smallestPlausibleBytes(paramsB: number | null): number | null {
  if (paramsB == null) return null;
  return Math.round(paramsB * 0.5 * 1024 ** 3);
}

/** Narrow the catalogue to what the reader typed. Matching is on the name only. */
export function filterModels(repos: HFRepo[], query: string): HFRepo[] {
  const q = query.trim().toLowerCase();
  if (!q) return repos;
  return repos.filter((r) => r.name.toLowerCase().includes(q));
}

/**
 * The `.litertlm` files inside one repo, largest last.
 *
 * `blobs=true` is what carries the byte size, and the size is not decoration:
 * it is what the download verifies against, and what tells a reader on mobile
 * data whether this is a 600 MB or a 6 GB decision.
 */
export async function fetchLiteRtFiles(repoId: string): Promise<HFFile[]> {
  const res = await fetchWithTimeout(`${HF_API}/models/${repoId}?blobs=true`);
  if (!res.ok) throw new Error(`Could not read that model's files (${res.status}).`);

  const data = (await res.json()) as { siblings?: HFFile[] };
  return (data.siblings ?? [])
    .filter((f) => isLiteRt(f.rfilename))
    .sort((a, b) => (a.size ?? 0) - (b.size ?? 0));
}

/** Direct download URL for one file in a repo. */
export function modelFileUrl(repoId: string, filename: string): string {
  return `${HF_RESOLVE}/${repoId}/resolve/main/${filename}`;
}

/** "gemma-4-e2b-it.litertlm" → "gemma 4 e2b it" — a human model name. */
export function modelDisplayName(filename: string): string {
  return filename.replace(/\.litertlm$/i, '').replace(/-/g, ' ');
}
