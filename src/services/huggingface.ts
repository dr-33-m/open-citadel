/**
 * What a brain weighs, asked of Hugging Face before it is downloaded.
 *
 * ExecuTorch's registry gives every file's URL and nothing about its size, and
 * the size is not decoration: it is what the storage check runs against, what
 * decides whether a brain fits this phone's memory, and what tells a reader on
 * mobile data whether this is a 300 MB or a 3 GB decision.
 *
 * The registry pins its files to a release tag (`resolve/v0.10.0/...`), so the
 * sizes are read at that same revision, one request per repo, and cached for
 * the session: a family's variants share a repo and usually a tokenizer.
 *
 * Pure fetch: no React, no store.
 */

import { fetchWithTimeout } from '@/utils/fetch-timeout';

const HF_API = 'https://huggingface.co/api';

/** A file's place on Hugging Face, read out of its download URL. */
export interface HFFileRef {
  repo: string;
  revision: string;
  path: string;
}

/** `https://huggingface.co/<org>/<repo>/resolve/<rev>/<path>` taken apart, or null for anything else. */
export function parseHFUrl(url: string): HFFileRef | null {
  const match = /^https:\/\/huggingface\.co\/([^/]+\/[^/]+)\/resolve\/([^/]+)\/(.+)$/.exec(url.split('?')[0]);
  return match ? { repo: match[1], revision: match[2], path: match[3] } : null;
}

type Sizes = Map<string, number>;
const sizesByRevision = new Map<string, Promise<Sizes>>();

async function fetchRevisionSizes(repo: string, revision: string): Promise<Sizes> {
  const res = await fetchWithTimeout(`${HF_API}/models/${repo}/revision/${revision}?blobs=true`);
  if (!res.ok) throw new Error(`Could not read that brain's files (${res.status}).`);
  const data = (await res.json()) as { siblings?: { rfilename: string; size?: number }[] };
  return new Map((data.siblings ?? []).map((f) => [f.rfilename, f.size ?? 0]));
}

function revisionSizes(repo: string, revision: string): Promise<Sizes> {
  const key = `${repo}@${revision}`;
  let pending = sizesByRevision.get(key);
  if (!pending) {
    pending = fetchRevisionSizes(repo, revision);
    // A failure is not remembered, so the next ask tries again.
    pending.catch(() => sizesByRevision.delete(key));
    sizesByRevision.set(key, pending);
  }
  return pending;
}

/**
 * Total bytes of every file behind `urls`, or null when any of them cannot be
 * measured. All or nothing, because a total missing its largest file is worse
 * than no total.
 */
export async function totalSizeBytes(urls: readonly string[]): Promise<number | null> {
  const refs = urls.map(parseHFUrl);
  if (refs.some((r) => r === null)) return null;
  const sizes = await Promise.all(
    (refs as HFFileRef[]).map(async (ref) => (await revisionSizes(ref.repo, ref.revision)).get(ref.path) ?? 0),
  );
  return sizes.every((n) => n > 0) ? sizes.reduce((a, b) => a + b, 0) : null;
}
