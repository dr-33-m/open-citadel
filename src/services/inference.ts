import { createLLM, isNativeAvailable, type Backend, type ExecuteResult, type MemoryUsage, type ToolResponse } from '@dr33m/react-native-litert-lm';
import { systemPromptForContext, toolsForContext } from './chat-tools';
import {
  ContextBudget,
  estimateTokens,
  MESSAGE_OVERHEAD_TOKENS,
  type ContextBudgetSnapshot,
  type ContextPressure,
  type ReplayMessage,
} from './context-budget';

type LiteRTLM = ReturnType<typeof createLLM>;

/**
 * Held back from the context window for the model's own reply, which can only
 * be charged after it has been generated.
 */
const REPLY_RESERVE_TOKENS = 768;

let _llm: LiteRTLM | null = null;
let _generation = 0;
let _budget: ContextBudget | null = null;
/** Cached probe: iOS tokenizes exactly, Android's countTokens() returns -1. */
let _nativeCounts: boolean | null = null;

export type { ExecuteResult, ToolResponse, Backend };

export { isNativeAvailable };

export interface ModelSettings {
  contextSize: number;
  backend: Backend;
  enableSpeculativeDecoding: boolean;
  enableThinking: boolean;
  enableToolCalling: boolean;
}

export function isModelLoaded(): boolean {
  return _llm?.isReady() ?? false;
}

export async function loadModel(filePath: string, settings?: Partial<ModelSettings>): Promise<void> {
  if (_llm) await unloadModel();

  const enableThinking = settings?.enableThinking ?? false;
  const enableToolCalling = settings?.enableToolCalling ?? true;

  const maxContextTokens = settings?.contextSize ?? 4096;
  const tools = enableToolCalling ? toolsForContext(maxContextTokens) : [];
  // Paired with the toolset above: the compact prompt describes only the
  // device toolset, so the two are chosen on the same threshold in one place.
  const systemPrompt = systemPromptForContext(maxContextTokens);

  _llm = createLLM();
  await _llm.loadModel(filePath, {
    systemPrompt,
    backend: settings?.backend ?? 'gpu',
    maxContextTokens,
    maxOutputTokens: 1024,
    temperature: 0.7,
    topP: 0.9,
    enableThinking,
    enableSpeculativeDecoding: settings?.enableSpeculativeDecoding ?? false,
    tools,
  });
  _generation += 1;
  _nativeCounts = null;

  // The system prompt and tool schemas are re-charged against the KV cache of
  // every conversation the engine builds, so they are the floor no amount of
  // compaction can go below.
  const baseline =
    tokensFor(systemPrompt) +
    tools.reduce((n, t) => n + tokensFor(`${t.name}${t.description}${t.parametersJson}`), 0);
  _budget = new ContextBudget(maxContextTokens, baseline, REPLY_RESERVE_TOKENS);
}

/**
 * Token count for `text`, exact where the engine can tokenize (iOS) and
 * conservatively estimated where it cannot (Android returns -1).
 */
function tokensFor(text: string): number {
  if (!text) return 0;
  if (_llm && _nativeCounts !== false) {
    try {
      const n = _llm.countTokens(text);
      if (n >= 0) {
        _nativeCounts = true;
        // Same envelope the estimate charges, so both platforms account alike.
        return Math.ceil(n) + MESSAGE_OVERHEAD_TOKENS;
      }
      _nativeCounts = false;
    } catch {
      _nativeCounts = false;
    }
  }
  return estimateTokens(text);
}

/** Everything the engine charged for one generation: reply, reasoning, tool calls. */
function chargeResult(result: ExecuteResult): void {
  if (!_budget) return;
  let tokens = tokensFor(result.text) + tokensFor(result.thinkingText ?? '');
  for (const call of result.toolCalls ?? []) {
    tokens += tokensFor(`${call.name}${call.argumentsJson}`);
  }
  _budget.chargeTokens(tokens);
}

export function getGeneration(): number {
  return _generation;
}

export async function unloadModel(): Promise<void> {
  if (_llm) {
    _llm.close();
    _llm = null;
    _budget = null;
    // Allow native GPU/compute resources to be fully released before new allocations.
    // Gallery app uses a similar 500ms stability buffer after init.
    await new Promise((r) => setTimeout(r, 500));
  }
}

export function resetConversation(): void {
  _llm?.resetConversation();
  _budget?.reset();
}

export function stopGeneration(): void {
  _llm?.stopGeneration();
}

export function getActiveBackend(): Backend | null {
  try {
    return _llm?.getActiveBackend() ?? null;
  } catch {
    return null;
  }
}

export type MemoryHeadroomResult = { ok: boolean; usage: MemoryUsage | null };

/**
 * Checked before every native call that could grow the engine's KV-cache
 * (a fresh message, or a tool-response round-trip). The underlying engine
 * calls (Kotlin SDK on Android, the raw litert-lm C API on iOS) can fail at
 * the native level under memory pressure — a failure mode that bypasses
 * Kotlin/Swift's own try/catch entirely and takes the whole process down.
 * No amount of catching after the fact fixes that; the only real defense is
 * refusing to make the call at all when memory is already tight.
 */
export function checkMemoryHeadroom(minAvailableBytes = 250 * 1024 * 1024): MemoryHeadroomResult {
  if (!_llm) return { ok: true, usage: null };
  try {
    const usage = _llm.getMemoryUsage();
    return { ok: !usage.isLowMemory && usage.availableMemoryBytes > minAvailableBytes, usage };
  } catch {
    // Fail OPEN — a diagnostic call failing must never itself block chat.
    return { ok: true, usage: null };
  }
}

/**
 * Send a single user message. The engine manages conversation history internally.
 */
export async function chat(
  userMessage: string,
  /**
   * `reasoningContent` is always empty here, and cannot be otherwise yet.
   *
   * The engine streams one undifferentiated token channel —
   * `execute(parts, onToken)` — and its reasoning only surfaces at the end, on
   * `ExecuteResult.thinkingText`, which is what fills the trace panel on this
   * path. The spec's `LoadOptions` doc mentions an `onThinkingToken`, but no
   * such parameter exists on the native interface; adding one is a fork change
   * and a native rebuild. Until then on-device thinking is a finished trace,
   * where cloud's is a live one.
   */
  onData: (data: { content: string; reasoningContent: string }) => void,
): Promise<ExecuteResult> {
  if (!_llm) throw new Error('No model loaded');

  _budget?.chargeTokens(tokensFor(userMessage));

  let acc = '';
  const result = await _llm.execute(
    [{ type: 'text', text: userMessage }],
    (token) => {
      acc += token;
      onData({ content: acc, reasoningContent: '' });
    },
  );
  chargeResult(result);
  return result;
}

/**
 * Feed tool execution results back into the stateful conversation.
 */
export async function sendToolResponses(
  responses: ToolResponse[],
  onData: (data: { content: string; reasoningContent: string }) => void,
): Promise<ExecuteResult> {
  if (!_llm) throw new Error('No model loaded');

  for (const r of responses) _budget?.chargeTokens(tokensFor(`${r.name}${r.responseJson}`));

  let acc = '';
  const result = await _llm.sendToolResponse(
    responses,
    (token) => {
      acc += token;
      onData({ content: acc, reasoningContent: '' });
    },
  );
  chargeResult(result);
  return result;
}

// ── Context window management ───────────────────────────────────────────────

/** Current KV-cache usage, or null when nothing is loaded (cloud mode). */
export function getContextSnapshot(): ContextBudgetSnapshot | null {
  return _budget?.snapshot() ?? null;
}

/**
 * Whether a turn of `text` can be taken, and if not, whether compacting the
 * conversation would rescue it. Always `ok` when no on-device engine is
 * loaded, so cloud mode falls through untouched.
 */
export function assessTurn(text: string): ContextPressure {
  return _budget ? _budget.pressure(tokensFor(text)) : 'ok';
}

/**
 * Whether `text` still fits without compacting. Used inside the tool loop,
 * where compaction is not an option — reseeding mid-loop would strand the
 * tool call the model is waiting on a response for.
 */
export function fitsInContext(text: string): boolean {
  return _budget ? _budget.fits(tokensFor(text)) : true;
}

/** Space a compaction has to work with, once the baseline is paid for. */
export function replayTokenBudget(): number {
  if (!_budget) return 0;
  return Math.max(0, Math.floor((_budget.usable - _budget.snapshot().baseline) * 0.6));
}

/**
 * Rebuild the native conversation around a trimmed history, freeing the KV
 * cache without losing the thread.
 *
 * Mirrors what the Google AI Edge Gallery app does on reset: close the
 * conversation and recreate it with `initialMessages`, keeping the engine
 * itself alive. Returns true when that native path was taken; older native
 * builds fall back to a reset plus a replayed digest turn, which costs one
 * extra prefill but keeps working without a rebuild.
 */
export async function compactConversation(seed: ReplayMessage[]): Promise<boolean> {
  if (!_llm) return false;

  // Typed as always present, but the JS proxy hands back undefined when the
  // installed native build predates the method — so this stays a real check.
  const reseed = _llm.resetConversationWith as ((m: ReplayMessage[]) => void) | undefined;

  if (typeof reseed === 'function') {
    reseed.call(_llm, seed);
    _budget?.reset();
    for (const m of seed) _budget?.chargeTokens(tokensFor(m.content));
    return true;
  }

  _llm.resetConversation();
  _budget?.reset();
  if (seed.length === 0) return false;

  const digest = seed
    .map((m) => `${m.role === 'model' ? 'Samwell' : 'Reader'}: ${m.content}`)
    .join('\n\n');
  await chat(`Earlier in this conversation:\n\n${digest}\n\nAcknowledge with "OK".`, () => {});
  return false;
}
