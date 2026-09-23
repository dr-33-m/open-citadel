/**
 * One conversation with the on-device model.
 *
 * Follows ExecuTorch's own `createLLMChatSession` step for step: the history is
 * rendered through the model's chat template, only the newly appended part is
 * prefilled, the cache is rewound to the end of the user's message after each
 * generation so tool results can be spliced in cleanly, and a failed turn is
 * rolled back whole. Read that file first; the differences are deliberate and
 * each is here for a reason the session cannot serve:
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
} from '@/services/device-llm/engine';
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
  temperature?: number;
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

/** One generation step, on the runner's worklet thread. */
function generateStep(
  runner: llm.LLMRunner,
  prompt: string,
  config: llm.LLMGenerationConfig,
  eosToken: string,
  stopRegex: RegExp | undefined,
  onToken: ((token: string) => void) | undefined,
): string {
  'worklet';
  let response = '';
  runner.generate(prompt, config, (token: string) => {
    if (token === eosToken) return;
    response += token;
    if (onToken) scheduleOnRN(onToken, token);
    if (stopRegex && stopRegex.test(response)) runner.stop();
  });
  return response;
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

  const { systemPrompt, toolFormat, maxToolTurns = DEFAULT_MAX_TOOL_TURNS, temperature = 0.7 } = options;
  const tools = toolFormat ? (options.tools ?? []) : [];
  const { runner, eosToken, prefill: prefillChunk } = engine;
  const reserve = replyReserveTokens(engine.contextTokens);
  const genConfig: llm.LLMGenerationConfig = {
    temperature,
    maxNewTokens: Math.min(options.maxNewTokens ?? reserve, reserve),
  };
  const stopRegex = tools.length > 0 ? toolFormat?.stopRegex : undefined;

  const preprocessor = et.llm.createChatPreprocessor({ chatTemplate: engine.chatTemplate, tools });
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
    for (const chunk of chunkForPrefill(text)) await prefillChunk(chunk);
  };

  const snapshot = (): ContextSnapshot => {
    const kv = runner.getKVCacheState();
    return { used: kv.pos, max: kv.maxSeqLen, baseline };
  };

  /** Puts this conversation's history into the cache if something else used it since. */
  const ensureResident = async () => {
    if (claimCache(owner)) return;
    committed = 0;
    try {
      if (system.length > 0) {
        await prefill(render(system, system.length, false));
        committed = system.length;
      }
      baseline = runner.getKVCacheState().pos;
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
        const posAtEndOfUser = runner.getKVCacheState().pos;
        committed = history.length;

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
              runner.reset(initialPos);
              return { messages: [], finishReason };
            }
            break;
          }

          // Everything but the last piece goes in as prefill, so no single
          // generate call is handed more than the export takes per call.
          const pieces = chunkForPrefill(render(history, history.length - committed, true));
          await prefill(pieces.slice(0, -1).join(''));

          let text = '';
          const onToken = hooks.onText
            ? (token: string) => {
                text += token;
                hooks.onText?.(text, step);
              }
            : undefined;
          let response: string;
          generating = true;
          try {
            response = await generate(runner, pieces[pieces.length - 1] ?? '', genConfig, eosToken, stopRegex, onToken);
          } finally {
            generating = false;
          }

          // Rewound to the end of the user's message whatever happened, so the
          // next step prefills the call and its results as the template writes
          // them rather than as the model happened to.
          runner.reset(posAtEndOfUser);

          if (stopRequested) {
            // Kept as far as it was shown. A call cut off halfway is markup
            // the model would otherwise read back as its own words next turn.
            const shown = stopRegex && toolFormat ? toolFormat.visible(response) : response;
            history.push({ role: 'assistant', content: shown });
            finishReason = 'stopped';
            break;
          }

          const parsed = tools.length > 0 ? toolFormat?.parse(response) : undefined;
          if (!parsed || parsed.toolCalls.length === 0) {
            history.push({ role: 'assistant', content: response });
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
        const uncommitted = history.length - committed;
        if (uncommitted > 0) {
          try {
            await prefill(render(history, uncommitted, false));
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
          runner.reset(initialPos);
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
      if (generating) runner.stop();
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
