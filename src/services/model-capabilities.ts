/**
 * What a model can actually do, read from its own chat template.
 *
 * The `.litertlm` file does not say. Its capability API reports one thing,
 * speculative decoding, and nothing about reasoning or tool calling. So this
 * used to be guessed from the filename: anything matching "gemma-4" was treated
 * as a thinking, tool-calling model and everything else as neither. That guess
 * was wrong for most of the catalogue — Qwen3 reasons and calls tools, Qwen2.5
 * calls tools, DeepSeek-R1 reasons — and the visible symptom was Qwen3's raw
 * `<think>` blocks arriving in the chat bubble because nothing had told the
 * engine to separate them.
 *
 * The chat template is the authoritative answer, because it is the thing the
 * engine renders every prompt with. `enable_thinking` is not a Gemma
 * convention; it is the exact variable Qwen3's template tests. A template that
 * references it understands reasoning, and one that branches on `tools` and
 * emits tool-call markers understands tool calling.
 *
 * The template usually lives on the base model rather than the conversion, so
 * the `base_model` tag is followed to find it. That is a network call, made
 * once when a model is downloaded and stored on its row.
 */

import { fetchWithTimeout } from '@/utils/fetch-timeout';

const HF_API = 'https://huggingface.co/api';
const HF_RAW = 'https://huggingface.co';

export interface ModelCapabilities {
  supportsThinking: boolean;
  supportsToolCalling: boolean;
  /** False when no template could be read, so the flags are defaults not findings. */
  detected: boolean;
}

/** What a model is assumed to do when its template cannot be read. */
export const UNKNOWN_CAPABILITIES: ModelCapabilities = {
  supportsThinking: false,
  supportsToolCalling: false,
  detected: false,
};

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * The chat template for `repoId`, or null.
 *
 * Two shapes are published: a bare `chat_template.jinja`, and a
 * `chat_template` field inside `tokenizer_config.json`. Both are tried because
 * which one a repo uses is not predictable.
 */
async function templateFor(repoId: string): Promise<string | null> {
  // Asked for together rather than in turn: which of the two a repo publishes
  // is not predictable, so the sequential version paid the first one's latency
  // in full for every repo that uses the second.
  const [jinja, config] = await Promise.all([
    fetchText(`${HF_RAW}/${repoId}/raw/main/chat_template.jinja`),
    fetchText(`${HF_RAW}/${repoId}/raw/main/tokenizer_config.json`),
  ]);
  if (jinja) return jinja;
  if (!config) return null;
  try {
    const parsed = JSON.parse(config) as { chat_template?: string | unknown[] };
    const template = parsed.chat_template;
    if (typeof template === 'string') return template;
    // Some repos ship an array of named templates; the whole thing is searched
    // rather than guessing which entry chat uses.
    if (Array.isArray(template)) return JSON.stringify(template);
    return null;
  } catch {
    return null;
  }
}

/** The repo a conversion was made from, per its `base_model` tag. */
async function baseModelOf(repoId: string): Promise<string | null> {
  const body = await fetchText(`${HF_API}/models/${repoId}`);
  if (!body) return null;
  try {
    const data = JSON.parse(body) as { tags?: string[] };
    for (const tag of data.tags ?? []) {
      if (!tag.startsWith('base_model:')) continue;
      // `base_model:finetune:x` and `base_model:quantized:x` are relationship
      // tags that repeat the same repo; the plain one is the model itself.
      const value = tag.slice('base_model:'.length);
      if (value.includes(':')) continue;
      return value;
    }
  } catch {
    return null;
  }
  return null;
}

/** Read capabilities out of a rendered chat template. */
export function capabilitiesFromTemplate(template: string): ModelCapabilities {
  // `enable_thinking` is the variable reasoning templates branch on; a literal
  // `<think>` means the template emits or strips the markers itself. Either
  // way the model reasons.
  const supportsThinking =
    template.includes('enable_thinking') || template.includes('<think>');

  // A template that merely mentions `tools` may only be declaring a parameter.
  // Emitting a tool call is the part that matters, so both are required.
  const supportsToolCalling =
    template.includes('tools') &&
    (template.includes('tool_call') || template.includes('tool_calls'));

  return { supportsThinking, supportsToolCalling, detected: true };
}

/**
 * Capabilities for a Hugging Face repo, checking the conversion first and its
 * base model second.
 *
 * Never throws: a model whose capabilities cannot be read is still perfectly
 * downloadable, it just gets the conservative defaults. The `<think>` stripping
 * on the display side is what keeps that safe.
 */
export async function detectCapabilities(repoId: string): Promise<ModelCapabilities> {
  const own = await templateFor(repoId);
  if (own) return capabilitiesFromTemplate(own);

  const base = await baseModelOf(repoId);
  if (!base) return UNKNOWN_CAPABILITIES;

  const inherited = await templateFor(base);
  if (!inherited) return UNKNOWN_CAPABILITIES;

  return capabilitiesFromTemplate(inherited);
}

/** The repo a model's download URL points at, or null for a non-HF URL. */
export function repoIdFromUrl(downloadUrl: string): string | null {
  const match = /^https:\/\/huggingface\.co\/([^/]+\/[^/]+)\/resolve\//.exec(downloadUrl);
  return match ? match[1] : null;
}
