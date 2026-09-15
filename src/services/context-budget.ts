/**
 * Token accounting for the on-device engine's fixed KV cache.
 *
 * LiteRT-LM allocates one KV cache per conversation, sized by
 * `EngineConfig.maxNumTokens`. Overflowing it is not a recoverable error the
 * way a cloud 4xx is: the native engine aborts the process, which no JS,
 * Kotlin or Swift catch block can intercept. Upstream exposes the cache
 * primitives but no coordinating layer to drive them, so the budget has to be
 * tracked here and enforced *before* each native call.
 *
 * See google-ai-edge/gallery#856 (OOM on KV-cache overflow) and
 * google-ai-edge/LiteRT-LM#1878 (no context-lifecycle layer).
 *
 * Everything here is pure and platform-free so it can be unit tested.
 */

/**
 * Conservative chars-per-token divisor. English prose averages ~4 chars per
 * token, but our traffic carries opaque ids (`hl-1787128870256-z5vu9z`) and
 * `[[ref:highlight:...]]` markers that tokenize closer to 2. Under-counting
 * risks the crash this module exists to prevent, so we deliberately over-count.
 */
export const CHARS_PER_TOKEN = 3.2;

/** Per-message envelope the engine adds for role and turn markers. */
export const MESSAGE_OVERHEAD_TOKENS = 6;

/**
 * Compact once the conversation has consumed this share of its usable space,
 * even if the next turn would still fit. Compaction is only safe at a turn
 * boundary (see `ContextBudget.pressure`), so we take the opportunity early
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

export interface ContextBudgetSnapshot {
  used: number;
  max: number;
  baseline: number;
  /** Share of the usable window consumed, 0-1, clamped. */
  ratio: number;
}

/**
 * Running token count for one native conversation. `baseline` is what the
 * engine re-charges on every conversation it builds (system prompt + tool
 * schemas); it is the floor that compaction can return us to, never below.
 */
export class ContextBudget {
  private used: number;

  constructor(
    readonly max: number,
    private baseline: number,
    /** Room held back for the model's own reply, which is charged after the fact. */
    readonly reserve: number,
  ) {
    this.used = baseline;
  }

  /** Usable space for conversation content, once the reply reserve is held back. */
  get usable(): number {
    return Math.max(0, this.max - this.reserve);
  }

  get remaining(): number {
    return Math.max(0, this.usable - this.used);
  }

  get ratio(): number {
    return this.usable === 0 ? 1 : Math.min(1, this.used / this.usable);
  }

  charge(text: string): void {
    this.chargeTokens(estimateTokens(text));
  }

  chargeTokens(tokens: number): void {
    this.used += Math.max(0, tokens);
  }

  /** Re-floor the budget when the system prompt or tool set changes. */
  rebase(baseline: number): void {
    this.baseline = baseline;
    this.used = Math.max(this.used, baseline);
  }

  /** Back to a fresh conversation holding only the baseline. */
  reset(): void {
    this.used = this.baseline;
  }

  fits(incomingTokens: number): boolean {
    return this.used + incomingTokens <= this.usable;
  }

  /**
   * Verdict for a turn of `incomingTokens`, evaluated at a turn boundary.
   * `full` is reserved for the genuinely impossible case: a single turn too
   * large for an otherwise empty conversation.
   */
  pressure(incomingTokens: number): ContextPressure {
    if (this.baseline + incomingTokens > this.usable) return 'full';
    if (!this.fits(incomingTokens) || this.ratio >= COMPACT_AT_RATIO) return 'compact';
    return 'ok';
  }

  snapshot(): ContextBudgetSnapshot {
    return { used: this.used, max: this.max, baseline: this.baseline, ratio: this.ratio };
  }
}

// ── Replay planning ─────────────────────────────────────────────────────────

export type ReplayRole = 'user' | 'model';

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
