/**
 * Context-window policy for the on-device engine.
 *
 * ExecuTorch allocates the KV cache once, at load, sized by the model's export,
 * and reports exactly how much of it is used (`getKVCacheState().pos`). So
 * nothing here counts tokens the engine has already seen. What is left is
 * policy: when to compact, how much history a compaction replays, and how much
 * room to hold back for a reply that has not been generated yet.
 *
 * Overflowing the cache is a catchable error under ExecuTorch, not the process
 * abort it was under LiteRT, but compacting early is still the difference
 * between a conversation that carries on and one that stops at a banner.
 *
 * Everything here is pure and platform-free so it can be unit tested.
 */

/**
 * Conservative chars-per-token divisor. English prose averages ~4 chars per
 * token, but our traffic carries opaque ids (`hl-1787128870256-z5vu9z`) and
 * `[[ref:highlight:...]]` markers that tokenize closer to 2. It sizes things
 * the engine has not seen yet (an incoming message, a tool result, a replay),
 * and an under-count there is a turn that stops at the device-limit banner,
 * so we deliberately over-count.
 */
export const CHARS_PER_TOKEN = 3.2;

/** Per-message envelope the engine adds for role and turn markers. */
export const MESSAGE_OVERHEAD_TOKENS = 6;

/**
 * Compact once the conversation has consumed this share of its usable space,
 * even if the next turn would still fit. Compaction is only safe at a turn
 * boundary (see `contextPressure`), so we take the opportunity early
 * rather than discovering we needed it halfway through a tool loop.
 */
export const COMPACT_AT_RATIO = 0.75;

export function estimateTokens(text: string): number {
  if (!text) return MESSAGE_OVERHEAD_TOKENS;
  return Math.ceil(text.length / CHARS_PER_TOKEN) + MESSAGE_OVERHEAD_TOKENS;
}

/**
 * `ok`      — proceed.
 * `compact` — the turn does not fit now but would after replaying a trimmed
 *             history into a fresh conversation.
 * `full`    — the turn does not fit even against a bare conversation, so
 *             compaction cannot rescue it. This is the only state the user
 *             ever has to be told about.
 */
export type ContextPressure = 'ok' | 'compact' | 'full';

/** One conversation's hold on the KV cache, in tokens. */
export interface ContextSnapshot {
  /** Tokens in the cache now: exact, from the engine. */
  used: number;
  /** The export's context window. */
  max: number;
  /**
   * What the conversation costs before a word is exchanged: the system prompt
   * and the tool schemas the template renders into it. The floor compaction
   * returns to, never below.
   */
  baseline: number;
}

/** The most room ever held back for a reply. */
const MAX_REPLY_RESERVE_TOKENS = 768;

/**
 * Room held back for the model's own reply, which can only be measured after
 * it has been generated. Doubles as the reply's length cap, so the two agree.
 *
 * A quarter of the window at most. A fixed 768 is right for a 4K window and
 * leaves a 2K window, where most exports sit, almost no room to talk once
 * Samwell's system prompt is in.
 */
export function replyReserveTokens(max: number): number {
  return Math.min(MAX_REPLY_RESERVE_TOKENS, Math.floor(max / 4));
}

/** Space for conversation content once the reply reserve is held back. */
export function usableTokens(max: number): number {
  return Math.max(0, max - replyReserveTokens(max));
}

/** Tokens the conversation can still take before the reply reserve. */
export function remainingTokens(s: ContextSnapshot): number {
  return Math.max(0, usableTokens(s.max) - s.used);
}

/**
 * Verdict for a turn of `incomingTokens`, evaluated at a turn boundary.
 * `full` is reserved for the genuinely impossible case: a single turn too
 * large for an otherwise empty conversation.
 */
export function contextPressure(s: ContextSnapshot, incomingTokens: number): ContextPressure {
  const usable = usableTokens(s.max);
  if (s.baseline + incomingTokens > usable) return 'full';
  const ratio = usable === 0 ? 1 : s.used / usable;
  if (s.used + incomingTokens > usable || ratio >= COMPACT_AT_RATIO) return 'compact';
  return 'ok';
}

/** Space a compaction replays into, once the baseline is paid for. */
export function replayTokenBudget(s: ContextSnapshot): number {
  return Math.max(0, Math.floor((usableTokens(s.max) - s.baseline) * 0.6));
}

// ── Replay planning ─────────────────────────────────────────────────────────

export type ReplayRole = 'user' | 'assistant';

export interface ReplayMessage {
  role: ReplayRole;
  content: string;
}

export interface ReplayPlan {
  /** Turns to seed the fresh conversation with, oldest first. */
  messages: ReplayMessage[];
  /** How many older turns were left behind. */
  dropped: number;
}

export interface ReplayInput {
  role: ReplayRole;
  content: string;
}

/**
 * Choose which turns survive a compaction.
 *
 * Walks backwards from the newest turn so the most recent exchange is always
 * kept, and stops once `tokenBudget` is spent. `systemContext` (the session's
 * book/journey priming) is charged first and always survives, because dropping
 * it would silently change what Samwell knows about the book being discussed.
 */
export function planReplay(
  history: ReplayInput[],
  tokenBudget: number,
  systemContext?: string,
): ReplayPlan {
  let spent = systemContext ? estimateTokens(systemContext) : 0;
  const kept: ReplayMessage[] = [];

  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (!entry.content.trim()) continue;
    const cost = estimateTokens(entry.content);
    if (spent + cost > tokenBudget) break;
    spent += cost;
    kept.push({ role: entry.role, content: entry.content });
  }

  kept.reverse();
  const usable = history.filter((h) => h.content.trim()).length;
  return { messages: kept, dropped: Math.max(0, usable - kept.length) };
}
