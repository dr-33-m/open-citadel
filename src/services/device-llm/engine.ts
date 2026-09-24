/**
 * The one on-device model, held for as long as Samwell is awake.
 *
 * ExecuTorch's `createLLMChatSession` loads its own runner, so each session is
 * a full model load: several seconds for a 2.5 GB brain, and two sessions at
 * once is two copies of it in memory. Samwell needs many conversations over
 * one model (the open chat, a chat title, a tag suggestion), so this module
 * owns the runner and `conversation.ts` builds conversations on top of it from
 * the library's lower-level pieces, the same ones its session is made of.
 *
 * The runner has one KV cache. Whichever conversation used it last is
 * "resident"; any other has to rebuild its history into the cache before it
 * can speak. Every use goes through `exclusive`, because the native runner
 * refuses a second caller outright (`RESOURCE_BUSY`) rather than waiting, and
 * that includes loading and freeing it.
 *
 * Taking tokens back out of the cache (`reset`, which only moves the write
 * position) is safe only for a plain attention cache, where everything past
 * the position is masked out. Gemma 4's cache is shared across layers and
 * windowed, and LFM 2.5 carries convolution state: in both, what was written
 * past the position is still read. Measured on Gemma 4: after a reset, any
 * conversation shorter than the one before it ended its turn at once. So for
 * those models starting over reloads the decoder, which is what ExecuTorch's
 * own Gemma 4 runner does, and nothing ever rewinds (`rewind`).
 */

import RNBlobUtil from 'react-native-blob-util';
import type { llm, LLMModel } from 'react-native-executorch';

import { getExecuTorch } from '@/lib/executorch';
import type { CatalogueModel } from '@/services/device-llm/catalogue';

export interface Engine {
  /** Replaced when the decoder is reloaded (`claimCache`); read it at each use. */
  runner: llm.LLMRunner;
  /** The catalogue brain this runner was loaded from. */
  readonly entry: CatalogueModel;
  /** The model's chat template, with its special tokens defined in it (`withSpecialTokens`). */
  readonly chatTemplate: string;
  readonly eosToken: string;
  /**
   * Every special token the tokenizer defines. Generation hands back whichever
   * end token stopped it, and none of them is ever meant to be read.
   */
  readonly specialTokens: readonly string[];
  /** The export's context window, fixed when it was built. */
  readonly contextTokens: number;
  /** `runner.prefill` on the library's worklet thread, wrapped once per runner. */
  prefill: (prompt: string) => Promise<void>;
  /** Whether moving the cache's position back leaves it clean. See the module note. */
  readonly rewindable: boolean;
  /** The local files it was loaded from, for reloading the decoder. */
  readonly files: LLMModel;
}

/** The engine callers may use. Null from the moment an unload is asked for. */
let engine: Engine | null = null;
/**
 * The runner this module owns and has yet to free. Outlives `engine` by the
 * time it takes the operation in flight to finish with it.
 */
let held: Engine | null = null;
/** Bumped on every load, so a conversation can tell its cache was rebuilt under it. */
let generation = 0;
/**
 * Bumped whenever a load or an unload is asked for. A load only publishes its
 * engine if nothing was asked for after it, so an unload requested mid-load
 * is not undone by the load finishing.
 */
let epoch = 0;
/** The conversation whose history the KV cache currently holds. */
let resident: object | null = null;
/**
 * Set when the cache holds tokens no conversation can account for: a turn
 * failed or was stopped on an engine that cannot rewind. The next claim
 * starts over from a clean cache, even for the same conversation.
 */
let dirty = false;
/**
 * Nothing has been written to the cache since the runner was made, so the
 * first conversation to claim it needs neither a reset nor a reload. Without
 * this, the first message after waking Gemma reloaded the model it had just
 * loaded.
 */
let pristine = false;
/** Tail of the queue every engine operation waits its turn on. */
let queue: Promise<unknown> = Promise.resolve();

export function getEngine(): Engine | null {
  return engine;
}

export function isEngineLoaded(): boolean {
  return engine !== null;
}

export function engineGeneration(): number {
  return generation;
}

/**
 * Hides the engine from new callers and stops what it is generating, so the
 * operation holding it finishes quickly and nothing queued behind it starts.
 */
function retire(): void {
  epoch += 1;
  engine = null;
  resident = null;
  dirty = false;
  try {
    held?.runner.stop();
  } catch {
    // Mid-reload (`reloadRunner`) the runner is already disposed while its
    // replacement is still being made, and stopping a disposed runner throws.
    // There is nothing running on it to stop.
  }
}

/** The special-token variables Hugging Face hands every chat template. */
const SPECIAL_TOKEN_KEYS = [
  'bos_token',
  'eos_token',
  'unk_token',
  'sep_token',
  'pad_token',
  'cls_token',
  'mask_token',
] as const;

type TokenizerConfig = Record<string, unknown> & {
  added_tokens_decoder?: Record<string, { content?: string; special?: boolean }>;
};

/** A special token's text, whether the config writes it bare or as `{ content }`. */
function tokenText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { content?: unknown }).content === 'string') {
    return (value as { content: string }).content;
  }
  return null;
}

/**
 * The template with `bos_token` and the other special tokens defined at its
 * head.
 *
 * Hugging Face's `apply_chat_template` passes them in, and ExecuTorch 0.10's
 * preprocessor passes none (its own legacy API did). A template that starts
 * `{{ bos_token }}`, as Gemma 4's and LFM 2.5's do, then renders no BOS, and
 * the runner adds none either, so the model reads every conversation without
 * the token it was trained to start from. Setting them in the template itself
 * renders it exactly as it was written to render.
 */
export function withSpecialTokens(template: string, config: TokenizerConfig): string {
  const sets = SPECIAL_TOKEN_KEYS.flatMap((key) => {
    const text = tokenText(config[key]);
    return text ? [`{% set ${key} = ${JSON.stringify(text)} %}`] : [];
  });
  return sets.join('') + template;
}

/** Every special token the config names: its added special tokens and its named ones. */
export function specialTokensOf(config: TokenizerConfig): string[] {
  const added = Object.values(config.added_tokens_decoder ?? {})
    .filter((t) => t.special && t.content)
    .map((t) => t.content!);
  const named = SPECIAL_TOKEN_KEYS.map((key) => tokenText(config[key])).filter((t): t is string => !!t);
  return [...new Set([...added, ...named])];
}

/** Frees the held runner. Only from inside `exclusive`, where nothing else is using it. */
function disposeHeld(): void {
  held?.runner.dispose();
  held = null;
}

/**
 * Loads a model from local files, replacing whatever was loaded.
 *
 * @param files Local paths, as `download()` resolves them. Remote URLs are not
 * fetched here: waking Samwell must never start a multi-gigabyte download.
 */
export function loadEngine(entry: CatalogueModel, files: LLMModel): Promise<void> {
  const et = getExecuTorch();
  if (!et) return Promise.reject(new Error('On-device AI is not available in this build.'));

  retire();
  const mine = epoch;
  return exclusive(async () => {
    // The old model goes before the new one loads: two in memory at once is
    // the likeliest way to be killed by the OS on the phones this targets.
    disposeHeld();

    const raw = JSON.parse(await RNBlobUtil.fs.readFile(files.tokenizerConfigPath, 'utf8')) as TokenizerConfig;
    const config = et.llm.parseTokenizerConfig(raw);
    // Created on the library's worklet thread, as its own session does: loading
    // is seconds of native work that would otherwise freeze the UI.
    const runner = await et.wrapAsync(et.llm.createLLMRunner)(files.modelPath, files.tokenizerPath);

    held = {
      runner,
      entry,
      files,
      rewindable: entry.rewindableCache !== false,
      chatTemplate: withSpecialTokens(config.chatTemplate, raw),
      eosToken: config.eosToken,
      specialTokens: specialTokensOf(raw),
      contextTokens: runner.getKVCacheState().maxSeqLen,
      prefill: et.wrapAsync(runner.prefill),
    };
    // Held either way, so whatever superseded this load frees it.
    if (epoch !== mine) return;
    engine = held;
    generation += 1;
    pristine = true;
  });
}

/** Frees the model and its cache, once whatever is running has stopped. */
export function unloadEngine(): Promise<void> {
  retire();
  return exclusive(async () => disposeHeld());
}

/**
 * Runs `fn` once every engine operation queued before it has finished.
 *
 * A failure is handed back to its own caller and does not poison the queue for
 * the next one.
 */
export function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Replaces the engine's runner with a fresh one over the same files: the only
 * way to empty a cache that a reset does not clean. Seconds of work, so it is
 * done only when a different conversation needs the cache.
 */
async function reloadRunner(current: Engine): Promise<void> {
  const et = getExecuTorch();
  if (!et) throw new Error('On-device AI is not available in this build.');
  current.runner.dispose();
  let runner: llm.LLMRunner;
  try {
    runner = await et.wrapAsync(et.llm.createLLMRunner)(current.files.modelPath, current.files.tokenizerPath);
  } catch (err) {
    // The old runner is gone and no new one came: no model is loaded any
    // more, rather than one whose every use throws that it was disposed.
    if (engine === current) retire();
    if (held === current) held = null;
    throw err;
  }
  current.runner = runner;
  current.prefill = et.wrapAsync(runner.prefill);
  pristine = true;
}

/**
 * Makes `owner` the conversation the KV cache belongs to. Only from inside
 * `exclusive`.
 *
 * @returns Whether `owner` already held it, so its history is still in place.
 * When false, the caller has an empty cache to rebuild into.
 */
export async function claimCache(owner: object): Promise<boolean> {
  const current = engine;
  if (!current) throw new Error('No model loaded');
  if (resident === owner && !dirty) return true;
  if (!pristine) {
    if (current.rewindable) current.runner.reset();
    else await reloadRunner(current);
  }
  pristine = false;
  dirty = false;
  resident = owner;
  return false;
}

/**
 * Takes the cache back to `pos`, when the engine can.
 *
 * @returns False when it cannot. The cache is then marked for a clean start,
 * and `owner` rebuilds its history into it on its next turn.
 */
export function rewind(owner: object, pos: number): boolean {
  const current = engine;
  if (current?.rewindable && resident === owner) {
    current.runner.reset(pos);
    return true;
  }
  if (resident === owner) {
    resident = null;
    dirty = true;
  }
  return false;
}

/** Whether `owner`'s history is what the cache holds right now. */
export function holdsCache(owner: object): boolean {
  return engine !== null && resident === owner;
}

/** Forgets that `owner` holds the cache, so its next turn rebuilds it. */
export function releaseCache(owner: object): void {
  if (resident === owner) resident = null;
}
