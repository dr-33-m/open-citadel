/**
 * Hugging Face model discovery — the network side of the model picker.
 *
 * Pure fetch + pure formatting: no React, no store. The picker sheet holds
 * the state machine (query → results → files → import); these are the
 * moves it can make.
 */

export type HFRepo = { id: string; downloads: number; likes: number };
export type HFFile = { rfilename: string; size?: number };

const HF_API = 'https://huggingface.co/api';
const HF_RESOLVE = 'https://huggingface.co';

/** Search LiteRT-LM-capable repos, most-downloaded first. */
export async function searchModels(query: string): Promise<HFRepo[]> {
  const res = await fetch(
    `${HF_API}/models?search=${encodeURIComponent(query)}&limit=20&sort=downloads`,
  );
  return (await res.json()) as HFRepo[];
}

/** The `.litertlm` files inside one repo — the only files this app can run. */
export async function fetchLiteRtFiles(repoId: string): Promise<HFFile[]> {
  const res = await fetch(`${HF_API}/models/${repoId}`);
  const data = await res.json();
  return (data.siblings ?? []).filter((f: { rfilename: string }) =>
    f.rfilename.endsWith('.litertlm'),
  );
}

/** Direct download URL for one file in a repo. */
export function modelFileUrl(repoId: string, filename: string): string {
  return `${HF_RESOLVE}/${repoId}/resolve/main/${filename}`;
}

/** "gemma-4-e2b-it.litertlm" → "gemma 4 e2b it" — a human model name. */
export function modelDisplayName(filename: string): string {
  return filename.replace(/\.litertlm$/i, '').replace(/-/g, ' ');
}
