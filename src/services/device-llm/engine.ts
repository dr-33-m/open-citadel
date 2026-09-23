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
 */

import RNBlobUtil from 'react-native-blob-util';
import type { llm, LLMModel } from 'react-native-executorch';

import { getExecuTorch } from '@/lib/executorch';
import type { CatalogueModel } from '@/services/device-llm/catalogue';

export interface Engine {
  readonly runner: llm.LLMRunner;
  /** The catalogue brain this runner was loaded from. */
  readonly entry: CatalogueModel;
  readonly chatTemplate: string;
  readonly eosToken: string;
  /** The export's context window, fixed when it was built. */
  readonly contextTokens: number;
  /** `runner.prefill` on the library's worklet thread, wrapped once per load. */
  readonly prefill: (prompt: string) => Promise<void>;
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
  held?.runner.stop();
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

    const config = et.llm.parseTokenizerConfig(
      JSON.parse(await RNBlobUtil.fs.readFile(files.tokenizerConfigPath, 'utf8')),
    );
    // Created on the library's worklet thread, as its own session does: loading
    // is seconds of native work that would otherwise freeze the UI.
    const runner = await et.wrapAsync(et.llm.createLLMRunner)(files.modelPath, files.tokenizerPath);

    held = {
      runner,
      entry,
      chatTemplate: config.chatTemplate,
      eosToken: config.eosToken,
      contextTokens: runner.getKVCacheState().maxSeqLen,
      prefill: et.wrapAsync(runner.prefill),
    };
    // Held either way, so whatever superseded this load frees it.
    if (epoch !== mine) return;
    engine = held;
    generation += 1;
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
 * Makes `owner` the conversation the KV cache belongs to.
 *
 * @returns Whether `owner` already held it, so its history is still in place.
 * When false, the caller has an empty cache to rebuild into.
 */
export function claimCache(owner: object): boolean {
  if (!engine) throw new Error('No model loaded');
  if (resident === owner) return true;
  engine.runner.reset();
  resident = owner;
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
