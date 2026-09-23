/**
 * One conversation with the on-device model.
 *
 * Follows ExecuTorch's own `createLLMChatSession`: the history is rendered
 * through the model's chat template, only the newly appended part is
 * prefilled, and a failed turn is rolled back whole. Read that file first; the
 * differences are deliberate and each is here for a reason the session cannot
 * serve:
 *
 * - It runs on the shared runner in `engine.ts`, so opening a conversation
 *   costs nothing and a new model load is never part of a chat switch.
 * - It claims the KV cache before each turn and rebuilds its history into it
 *   when another conversation used the cache in between.
 * - It checks the window before a turn and says so (`ContextPressureError`)
 *   rather than finding out halfway through, so the caller can compact first.
 * - Its history can be replaced (`reseed`), which is how compaction works.
 * - Prefills go in chunks, because some exports take fewer tokens per call
 *   than their window holds (Gemma 4 E2B: 2048 per call, 4048 in the cache).
 * - A stop is honoured between steps too, not only during generation, so a
 *   stop pressed while a tool runs does not start the model again.
 * - The cache is never rewound inside a turn. The session takes each
 *   generation back out and prefills it again as the template writes it; on
 *   Gemma 4 and LFM 2.5 taking tokens back leaves them readable (see
 *   `engine.ts`), and every turn after a stop or a tool call broke. Here each
 *   step adds only what the template writes past what the cache already
 *   holds, and only when the model wrote something the template would not
 *   (reasoning the history leaves out, a call in its own spacing) is the
 *   cache taken back, or rebuilt where it cannot be.
 */

import type { LLMChatTurnResult, llm } from 'react-native-executorch';
import { scheduleOnRN } from 'react-native-worklets';

import { getExecuTorch } from '@/lib/executorch';
import {
  contextPressure,
  estimateTokens,
  replyReserveTokens,
  type ContextPressure,
  type ContextSnapshot,
} from '@/services/context-budget';
import {
  claimCache,
  exclusive,
  getEngine,
  holdsCache,
  releaseCache,
  rewind,
} from '@/services/device-llm/engine';
import {
  asThinkMarkers,
  THINK_MARKERS,
  withoutReasoning,
} from '@/services/device-llm/reply-format';
import type { ToolFormat } from '@/services/device-llm/tool-format';

type ChatMessage = llm.ChatMessage;

export interface ConversationOptions {
  /** Held at the front of the cache for the conversation's whole life. */
  systemPrompt?: string;
  /** Tools the model may call. Ignored without a `toolFormat` to read the calls. */
  tools?: readonly llm.ToolDefinition[];
  toolFormat?: ToolFormat;
  /** Generation steps a single turn may take before it is cut off. Defaults to 3. */
  maxToolTurns?: number;
  /** Defaults to the brain's own (`CatalogueModel.temperature`), else 0.7. */
  temperature?: number;
  /**
   * Whether a brain that can reason does, before it answers. Off by default:
   * on a 2048-token window, reasoning can spend the reply's whole allowance
   * and leave no answer. Ignored by a brain that cannot reason.
   */
  thinking?: boolean;
  /**
   * Longest reply, in tokens. Defaults to the room the window holds back for
   * one (`replyReserveTokens`), and is never allowed past it.
   */
  maxNewTokens?: number;
}

export interface TurnHooks {
  /**
   * Everything the current generation step has produced so far, from its first
   * token. `step` counts from 0 and moves on after each round of tool calls.
   */
  onText?: (text: string, step: number) => void;
}

export interface TurnResult {
  /** What this turn added to the history: the user's message, any tool rounds, the reply. */
  readonly messages: readonly ChatMessage[];
  /** `stopped` when the reader stopped the turn before the model finished. */
  readonly finishReason: LLMChatTurnResult['finishReason'] | 'stopped';
}

/** Thrown before a turn starts, when it does not fit the window as things stand. */
export class ContextPressureError extends Error {
  constructor(
    readonly pressure: Exclude<ContextPressure, 'ok'>,
    /** The window as the check saw it, for sizing a compaction. */
    readonly snapshot: ContextSnapshot,
  ) {
    super(`Context ${pressure}`);
    this.name = 'ContextPressureError';
  }
}

/**
 * Whether a native failure was the cache running out of room.
 *
 * The runner checks a prompt against the space left before it writes anything,
 * and refuses with ExecuTorch's `InvalidArgument` (0x12). Its other reasons for
 * that code (an empty prompt, a temperature out of range) are ones this module
 * never sends.
 */
export function isContextOverflow(err: unknown): boolean {
  const et = getExecuTorch();
  return !!et && et.isRnExecuTorchError(err) && err.etRuntimeErrorCode === 0x12;
}

export interface Conversation {
  sendMessage(content: string, hooks?: TurnHooks): Promise<TurnResult>;
  /** Replaces everything after the system prompt. Rebuilt into the cache on the next turn. */
  reseed(messages: readonly ChatMessage[]): void;
  getHistory(): readonly ChatMessage[];
  /** The conversation's hold on the cache, or null while another conversation has it. */
  context(): ContextSnapshot | null;
  /** Stops the turn in flight, including between its steps. */
  stop(): void;
  dispose(): void;
}

const DEFAULT_MAX_TOOL_TURNS = 3;
const DEFAULT_TEMPERATURE = 0.7;
/** A stand-in for a reply's text, to find what a template writes around it. */
const PLACEHOLDER = '⟦samwell-reply⟧';

/**
 * Longest text handed to a single native prefill or generate call.
 *
 * Kept well under the smallest per-call limit in the catalogue (2048 tokens)
 * at the most pessimistic tokenization our traffic sees (about 2 chars a
 * token, for ids and reference markers).
 */
const PREFILL_CHUNK_CHARS = 3000;

/** Splits text at line breaks into pieces no longer than the chunk size. */
export function chunkForPrefill(text: string, limit = PREFILL_CHUNK_CHARS): string[] {
  if (text.length <= limit) return text ? [text] : [];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    // Breaking on a newline keeps special tokens like `<|turn>` whole, since
    // chat templates never put one across a line break.
    let cut = rest.lastIndexOf('\n', limit - 1);
    cut = cut <= 0 ? limit : cut + 1;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/**
 * One generation step, on the runner's worklet thread.
 *
 * @param hidden Special tokens to leave out of the text, as a lookup. The
 * runner hands back the end token that stopped it, and a family has several
 * (Gemma: `<turn|>`, `<eos>`, `<|tool_response>`), so matching the tokenizer's
 * one `eos_token` let the others through into the reply.
 */
function generateStep(
  runner: llm.LLMRunner,
  prompt: string,
  config: llm.LLMGenerationConfig,
  hidden: Record<string, true>,
  stopRegex: RegExp | undefined,
  onToken: ((token: string) => void) | undefined,
): { text: string; all: string; last: string; dropped: string[]; stats: llm.LLMGenerationStats } {
  'worklet';
  let response = '';
  // Every token, hidden ones too, and the last: what the cache now holds is
  // the prompt and all of them but the last, which is sampled and never fed.
  let all = '';
  let last = '';
  const dropped: string[] = [];
  const stats = runner.generate(prompt, config, (token: string) => {
    all += token;
    last = token;
    // Compared to `true`, so a token like "constructor" never matches the
    // object's own prototype.
    if (hidden[token] === true) {
      // Kept for the log when a reply comes back empty: which token ended it.
      if (dropped.length < 8) dropped.push(token);
      return;
    }
    response += token;
    if (onToken) scheduleOnRN(onToken, token);
    if (stopRegex && stopRegex.test(response)) runner.stop();
  });
  return { text: response, all, last, dropped, stats };
}

/**
 * What a step cost, for measuring on a device (dev builds only), in the terms
 * Software Mansion's gallery reports: decode speed, time to the first token,
 * and how full the window is.
 */
function logStep(stats: llm.LLMGenerationStats, stepMs: number, kv: llm.LLMKVCacheState): void {
  const decodeMs = stats.inferenceEndMs - stats.firstTokenMs;
  const perSecond = decodeMs > 0 ? (stats.numGeneratedTokens / decodeMs) * 1000 : 0;
  const firstToken = stepMs - (stats.inferenceEndMs - stats.firstTokenMs);
  console.log(
    `[Samwell] ${stats.numGeneratedTokens} tokens at ${perSecond.toFixed(1)}/s, ` +
      `first after ${(firstToken / 1000).toFixed(1)}s, cache ${kv.pos}/${kv.maxSeqLen}`,
  );
}

/**
 * A conversation over the engine loaded now.
 *
 * It is bound to that engine for life: its template is that model's, so once
 * another model is loaded every turn it is asked for fails, and the caller
 * makes a new one.
 */
export function createConversation(options: ConversationOptions = {}): Conversation {
  const et = getExecuTorch();
  const engine = getEngine();
  if (!et || !engine) throw new Error('No model loaded');

  const {
    systemPrompt: instructions,
    toolFormat,
    thinking = false,
    maxToolTurns = DEFAULT_MAX_TOOL_TURNS,
    temperature = engine.entry.temperature ?? DEFAULT_TEMPERATURE,
  } = options;
  const tools = toolFormat ? (options.tools ?? []) : [];
  const reserve = replyReserveTokens(engine.contextTokens);
  const genConfig: llm.LLMGenerationConfig = {
    temperature,
    maxNewTokens: Math.min(options.maxNewTokens ?? reserve, reserve),
    // On by default in the runtime, which then hands the prompt back as the
    // reply's first token: the template's turn opener, `<|turn>model`, shown
    // to the reader and written into chat titles.
    echo: false,
  };
  const stopRegex = tools.length > 0 ? toolFormat?.stopRegex : undefined;

  const reasoning = engine.entry.reasoning ?? THINK_MARKERS;
  // Every special token but the ones a tool call is written in and the ones
  // reasoning is marked with, which the text still has to carry.
  const kept = new Set([
    ...(stopRegex ? (toolFormat?.keepTokens ?? []) : []),
    reasoning.open,
    reasoning.close,
    THINK_MARKERS.open,
    THINK_MARKERS.close,
  ]);
  const hidden: Record<string, true> = {};
  for (const token of [...engine.specialTokens, engine.eosToken]) {
    if (!kept.has(token)) hidden[token] = true;
  }

  // Each brain's own switch, set once for the conversation's life: a change
  // in the system turn is a new conversation.
  const control = engine.entry.thinking;
  const systemPrompt =
    control === 'switch' ? [instructions, thinking ? '/think' : '/no_think'].filter(Boolean).join('\n\n') : instructions;
  const chatTemplate =
    control === 'template' && thinking ? `{% set enable_thinking = true %}${engine.chatTemplate}` : engine.chatTemplate;

  const preprocessor = et.llm.createChatPreprocessor({ chatTemplate, tools });
  const system: ChatMessage[] = systemPrompt ? [{ role: 'system', content: systemPrompt }] : [];
  const generate = et.wrapAsync(generateStep);

  const owner = {};
  const history: ChatMessage[] = [...system];
  /** Messages in `history` whose tokens are in the cache. */
  let committed = 0;
  let baseline = 0;
  let stopRequested = false;
  /** True only while this conversation's own generate call runs, so its stop never lands on another's. */
  let generating = false;
  let disposed = false;

  /** Renders the newest `lastK` messages the way the template continues the ones before them. */
  const render = (messages: readonly ChatMessage[], lastK: number, addGenPrompt: boolean): string => {
    try {
      // Text only: the preprocessor hands back a plain string when no media is attached.
      return preprocessor.process(messages, lastK, { addGenPrompt }) as string;
    } finally {
      preprocessor.clear();
    }
  };

  /**
   * On the runner's worklet thread, as the library's session does it. The
   * native call is synchronous, and a system prompt's worth of prefill held on
   * the JS thread would freeze the UI for seconds.
   */
  const prefill = async (text: string) => {
    for (const chunk of chunkForPrefill(text)) await engine.prefill(chunk);
  };

  const snapshot = (): ContextSnapshot => {
    const kv = engine.runner.getKVCacheState();
    return { used: kv.pos, max: kv.maxSeqLen, baseline };
  };

  /** Puts this conversation's history into the cache if something else used it since. */
  const ensureResident = async () => {
    if (await claimCache(owner)) return;
    committed = 0;
    try {
      if (system.length > 0) {
        await prefill(render(system, system.length, false));
        committed = system.length;
      }
      baseline = engine.runner.getKVCacheState().pos;
      if (history.length > committed) {
        try {
          await prefill(render(history, history.length - committed, false));
        } catch (err) {
          // The history outgrew the window since it was last in the cache: its
          // closing prefill ran out of room. Replaying less of it is the fix,
          // and that is the caller's to do.
          if (!isContextOverflow(err)) throw err;
          const max = engine.contextTokens;
          throw new ContextPressureError('compact', { used: max, max, baseline });
        }
        committed = history.length;
      }
    } catch (err) {
      // Half a history in the cache is worse than none: the next turn starts over.
      releaseCache(owner);
      throw err;
    }
  };

  const runTool = async (call: llm.ToolCall): Promise<llm.ChatMessageContent> => {
    const tool = tools.find((t) => t.function.name === call.function.name);
    if (!tool) return `Error: Tool '${call.function.name}' is not recognized or not available.`;
    try {
      return await tool.execute(call.function.arguments);
    } catch (err) {
      return `Error executing tool ${call.function.name}: ${String(err)}`;
    }
  };

  const sendMessage = (content: string, hooks: TurnHooks = {}): Promise<TurnResult> => {
    // Cleared at the call, not when the engine frees up: a stop pressed while
    // this turn waits its turn belongs to it.
    stopRequested = false;

    return exclusive(async () => {
      if (disposed || getEngine() !== engine) throw new Error('No model loaded');

      await ensureResident();

      const before = snapshot();
      const pressure = contextPressure(before, estimateTokens(content));
      if (pressure !== 'ok') throw new ContextPressureError(pressure, before);

      const initialCommitted = committed;
      const initialPos = before.used;
      const turnStart = history.length;

      history.push({ role: 'user', content });

      try {
        await prefill(render(history, history.length - committed, false));
        committed = history.length;
        /** Where the last message the template rendered ends in the cache. */
        let committedPos = engine.runner.getKVCacheState().pos;
        /**
         * What the cache holds past `committedPos`, as text: each step's prompt
         * and what the model generated after it, but for its last token, which
         * the runner samples and never feeds back.
         */
        let cached = '';

        /**
         * What the template writes past what the cache holds: the next prompt
         * (`addGenPrompt`), or the rest of the turn to close it. Where the model
         * wrote something the template would not, the cache is taken back to
         * the last rendered message, or rebuilt where it cannot be.
         */
        const continuation = async (addGenPrompt: boolean): Promise<string> => {
          const target = render(history, history.length - committed, addGenPrompt);
          if (target.startsWith(cached)) return target.slice(cached.length);
          if (__DEV__) {
            console.log(`[Samwell] The model's text left the template's; ${engine.rewindable ? 'rewinding' : 'rebuilding'}`);
          }
          cached = '';
          if (rewind(owner, committedPos)) return target;
          await ensureResident();
          committedPos = engine.runner.getKVCacheState().pos;
          return render(history, history.length - committed, addGenPrompt);
        };

        /*
         * On an engine that cannot rewind, the cache keeps what the model
         * wrote as it wrote it, and a step adds only what the template writes
         * to go on from it. Rebuilding every time the two differ cost Gemma a
         * reload and a full rebuild at the end of nearly every turn: it writes
         * its text before a call where the template puts it after, and opens
         * an empty thought channel the history leaves out.
         */
        /** The last token of the step just generated: sampled, never fed. */
        let lastToken = '';

        /** What the template writes after the last message's text: its turn closer (Gemma: `<turn|>\n`). */
        const closerAfterReply = (): string | null => {
          const reply = history[history.length - 1];
          if (reply?.role !== 'assistant') return null;
          const probe = [...history.slice(0, -1), { ...reply, content: PLACEHOLDER }];
          const text = render(probe, probe.length - committed, false);
          const at = text.lastIndexOf(PLACEHOLDER);
          return at === -1 ? null : text.slice(at + PLACEHOLDER.length);
        };

        /** What the template writes from the end of a call on: the call's closing token, then its results. */
        const resultsAfterCall = (): string | null => {
          let call = history.length - 1;
          while (call >= 0 && history[call]?.role !== 'assistant') call--;
          const probe = history.map((m, i) => (i === call ? { ...m, content: '' } : m));
          const text = render(probe, probe.length - committed, true);
          const at = text.lastIndexOf(lastToken);
          return lastToken && at !== -1 ? text.slice(at) : null;
        };

        /** The next step's prompt after a round of tool results. */
        const promptAfterTools = async (): Promise<string> => {
          if (engine.rewindable) return continuation(true);
          const results = resultsAfterCall();
          if (results !== null) return results;
          // Nothing to go on from: the one case worth a rebuild mid-turn.
          rewind(owner, committedPos);
          await ensureResident();
          committedPos = engine.runner.getKVCacheState().pos;
          cached = '';
          return render(history, history.length - committed, true);
        };

        /** Whether a stopped reply was cut back before it went into the history. */
        let cutBack = false;

        let finishReason: TurnResult['finishReason'] = 'maxToolTurns';

        for (let step = 0; step < maxToolTurns; step++) {
          if (stopRequested) {
            finishReason = 'stopped';
            // Stopped before the model said anything at all: the message is
            // taken back whole, as a failed turn is. Left in, it would sit
            // unanswered, and the next user message after it breaks the
            // turn-taking some chat templates refuse to render.
            if (step === 0) {
              history.length = turnStart;
              committed = initialCommitted;
              rewind(owner, initialPos);
              return { messages: [], finishReason };
            }
            break;
          }

          // Everything but the last piece goes in as prefill, so no single
          // generate call is handed more than the export takes per call.
          const stepStart = Date.now();
          const prompt = step === 0 ? await continuation(true) : await promptAfterTools();
          const pieces = chunkForPrefill(prompt);
          await prefill(pieces.slice(0, -1).join(''));

          let text = '';
          const onToken = hooks.onText
            ? (token: string) => {
                text += token;
                hooks.onText?.(asThinkMarkers(text, reasoning), step);
              }
            : undefined;
          let response: string;
          generating = true;
          try {
            const out = await generate(engine.runner, pieces[pieces.length - 1] ?? '', genConfig, hidden, stopRegex, onToken);
            response = out.text;
            cached += prompt + out.all.slice(0, out.all.length - out.last.length);
            lastToken = out.last;
            if (__DEV__) logStep(out.stats, Date.now() - stepStart, engine.runner.getKVCacheState());
            if (__DEV__ && !withoutReasoning(response, reasoning)) {
              console.warn(
                `[Samwell] Empty reply. Hidden tokens it emitted: ${out.dropped.join(' ') || 'none'}; raw: ${JSON.stringify(response.slice(0, 200))}`,
              );
            }
          } finally {
            generating = false;
          }

          if (stopRequested) {
            // Kept as far as it was shown. A call cut off halfway is markup
            // the model would otherwise read back as its own words next turn.
            const shown = stopRegex && toolFormat ? toolFormat.visible(response) : response;
            cutBack = shown !== response;
            history.push({ role: 'assistant', content: withoutReasoning(shown, reasoning) });
            finishReason = 'stopped';
            break;
          }

          const parsed = tools.length > 0 ? toolFormat?.parse(response) : undefined;
          if (!parsed || parsed.toolCalls.length === 0) {
            // Its reasoning stays out of the history, as Google and Qwen both
            // require: the model is not meant to read its past thoughts, and
            // they are room a small window needs. Between tool calls it stays,
            // which Gemma needs to finish what it started.
            history.push({ role: 'assistant', content: withoutReasoning(response, reasoning) });
            finishReason = 'stop';
            break;
          }

          history.push({ role: 'assistant', content: parsed.textContent, toolCalls: parsed.toolCalls });
          for (const call of parsed.toolCalls) {
            const result = await runTool(call);
            history.push({ role: 'tool', toolCallId: call.id, name: call.function.name, content: result });
          }
        }

        // Close the turn in the cache, so the next one only has to add itself.
        if (history.length > committed) {
          try {
            if (engine.rewindable) {
              const rest = await continuation(false);
              if (rest) await prefill(rest);
            } else {
              const closer = cutBack ? null : closerAfterReply();
              if (closer === null) {
                // Nothing clean to close it with (a call cut off by a stop,
                // a turn out of steps): the next turn starts from a clean
                // cache instead, rather than keeping the reader waiting now.
                rewind(owner, committedPos);
              } else {
                // The end token the model stopped on was never fed; the
                // template's own closer goes in its place.
                await prefill((hidden[lastToken] === true ? '' : lastToken) + closer);
              }
            }
            committed = history.length;
          } catch (err) {
            if (!isContextOverflow(err)) throw err;
            // The reply filled the window. It was said and it stays said; the
            // next turn rebuilds the cache, and compacts on the way.
            releaseCache(owner);
          }
        }

        return { messages: history.slice(turnStart), finishReason };
      } catch (err) {
        // As the library's session does: roll history and cache back to where
        // the turn found them, and never let the rewind replace the error.
        history.length = turnStart;
        committed = initialCommitted;
        try {
          rewind(owner, initialPos);
        } catch {
          releaseCache(owner);
        }
        throw err;
      }
    });
  };

  return {
    sendMessage,
    reseed(messages) {
      history.length = 0;
      history.push(...system, ...messages);
      committed = 0;
      releaseCache(owner);
    },
    getHistory: () => [...history],
    context() {
      if (getEngine() !== engine || !holdsCache(owner)) return null;
      return snapshot();
    },
    stop() {
      stopRequested = true;
      if (generating) engine.runner.stop();
    },
    dispose() {
      disposed = true;
      // Behind whatever is queued: a turn stopped on the way out of a chat is
      // still closing itself in the cache, and needs its preprocessor to.
      void exclusive(async () => {
        releaseCache(owner);
        preprocessor.dispose();
      });
    },
  };
}
