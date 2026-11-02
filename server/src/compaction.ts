/**
 * Context compaction for cloud chat.
 *
 * A long conversation eventually passes the model's context window and the
 * call fails. This shrinks what the model sees before each call, while the
 * stored transcript on the device stays complete.
 *
 * ## Why this is written out rather than installed
 *
 * `@tanstack/ai-compaction` does exactly this job, and its shape is what the
 * code below follows: a `withCompaction` middleware, a strategy function that
 * rewrites messages when an estimate crosses `maxTokens`, and the same three
 * built-in strategies. It is not installed because it declares
 * `peerDependencies: { '@tanstack/ai': '^0.52.0' }` and this project is pinned
 * to 0.40.0 across both the app and this server. Adopting the package means a
 * twelve-minor-version bump of the library every paid chat request already
 * flows through, to gain one 0.1.0 dependency.
 *
 * The whole mechanism it needs is already in 0.40: `onConfig` fires at init
 * and at the start of each agent iteration, may return a partial config to
 * replace `messages`, and may be async — which is what makes an LLM-backed
 * summarize step possible. So the middleware is ~40 lines here, and the
 * project's own token estimator can be used instead of a generic one.
 *
 * If the pin ever reaches 0.52, most of this file can be deleted in favour of
 * the package; the option names were kept identical so that swap is
 * mechanical. `summarizeOldest`'s checkpoints (a summary kept between
 * requests and updated rather than rewritten) are this project's own, and
 * would need to come across as a custom strategy.
 *
 * ## What is kept safe
 *
 * - **System prompts are never touched.** `chat()` keeps `systemPrompts` as a
 *   separate field from `messages`, so compaction structurally cannot drop
 *   Samwell's persona or the session's book grounding.
 * - **Tool calls stay paired with their results.** An assistant message
 *   carrying `toolCalls` and the `tool` messages answering it are one unit; a
 *   request with an orphaned tool result is rejected by the provider, which
 *   would turn a context problem into a hard error.
 * - **The transcript is not rewritten.** This only changes the messages handed
 *   to the provider for one call. The device keeps every message.
 */
import { createHash } from 'node:crypto';

import type { ChatMiddleware, ModelMessage } from '@tanstack/ai';

/**
 * Rewrites the conversation, or returns `null` to leave it alone.
 *
 * Only ever called when the estimate is already over budget, so a strategy
 * does not need to check first.
 */
export type CompactionStrategy = (
  messages: ModelMessage[],
  ctx: CompactionContext,
) => ModelMessage[] | null | Promise<ModelMessage[] | null>;

export interface CompactionContext {
  maxTokens: number;
  estimateTokens: (message: ModelMessage) => number;
}

export interface CompactionInfo {
  before: number;
  after: number;
  messagesBefore: number;
  messagesAfter: number;
}

/**
 * Text carried by a message, whatever shape its content takes.
 *
 * `ModelMessage.content` is `string | null | ContentPart[]`, and tool calls
 * live in a sibling field rather than in the content. All of it costs tokens,
 * so all of it is counted.
 */
function textOf(message: ModelMessage): string {
  const parts = [contentText(message)];

  // Arguments to a tool call are sent verbatim and are frequently the largest
  // thing in an assistant message.
  if (message.toolCalls?.length) parts.push(JSON.stringify(message.toolCalls));

  return parts.join('\n');
}

/** The words of a message, without its tool calls. */
export function contentText(message: ModelMessage): string {
  const parts: string[] = [];
  const { content } = message;

  if (typeof content === 'string') parts.push(content);
  else if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part === 'string') parts.push(part);
      else if (part && typeof part === 'object') {
        const value = part as { content?: unknown; text?: unknown };
        if (typeof value.content === 'string') parts.push(value.content);
        else if (typeof value.text === 'string') parts.push(value.text);
        // A structured part with no plain text still occupies the request.
        else parts.push(JSON.stringify(part));
      }
    }
  }

  return parts.join('\n');
}

/**
 * Stands for a run of messages exactly: the same messages, in the same order,
 * give the same string. How a checkpoint knows the conversation it was written
 * for is still the one in front of it.
 *
 * A chain, one link per message, so a fingerprint can be carried on from
 * where another stopped: `extendFingerprint(fingerprintMessages(a), b)` is
 * `fingerprintMessages([...a, ...b])`. A request that compacts twice no longer
 * has the start of the conversation in front of it the second time, only its
 * own summary of it, and still has to describe the whole of it.
 */
export function extendFingerprint(from: string, messages: ModelMessage[]): string {
  let fingerprint = from;
  for (const message of messages) {
    fingerprint = createHash('sha256')
      .update(fingerprint)
      .update('\u0000')
      .update(message.role)
      .update('\u0000')
      .update(textOf(message))
      .digest('hex');
  }
  return fingerprint;
}

export function fingerprintMessages(messages: ModelMessage[]): string {
  return extendFingerprint('', messages);
}

/**
 * Default per-message estimate.
 *
 * 3.2 characters per token rather than the usual 4, matching
 * `src/services/context-budget.ts` in the app and for the same reason: this
 * traffic carries opaque ids (`hl-1787128870256-z5vu9z`) and
 * `[[ref:highlight:…]]` markers that tokenize closer to 2. Over-counting costs
 * a slightly earlier compaction; under-counting costs a failed request.
 */
const CHARS_PER_TOKEN = 3.2;
const MESSAGE_OVERHEAD_TOKENS = 6;

export function estimateMessageTokens(message: ModelMessage): number {
  const text = textOf(message);
  return Math.ceil(text.length / CHARS_PER_TOKEN) + MESSAGE_OVERHEAD_TOKENS;
}

/**
 * The same estimate for a bare string.
 *
 * The server re-sends its own system prompts on every request - the persona,
 * the book grounding - and they are part of what a turn costs, but they are
 * not `ModelMessage`s (system is not a message role here; prompts travel in
 * their own field). This keeps the characters-per-token decision in the one
 * place instead of a second, drifting copy of it.
 */
export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN) + MESSAGE_OVERHEAD_TOKENS;
}

function totalTokens(
  messages: ModelMessage[],
  estimate: (m: ModelMessage) => number,
): number {
  let sum = 0;
  for (const message of messages) sum += estimate(message);
  return sum;
}

// ── Tool-call pairing ───────────────────────────────────────────────────────

/**
 * Group messages into units that must survive or be dropped together.
 *
 * An assistant message with `toolCalls` and the `tool` messages that answer it
 * cannot be separated: providers reject a tool result whose call is missing,
 * and reject a call with no result when the conversation continues past it.
 * Every built-in strategy cuts along these boundaries rather than between
 * individual messages.
 */
interface MessageGroup {
  messages: ModelMessage[];
  tokens: number;
}

function groupMessages(
  messages: ModelMessage[],
  estimate: (m: ModelMessage) => number,
): MessageGroup[] {
  const groups: MessageGroup[] = [];

  for (const message of messages) {
    const previous = groups[groups.length - 1];
    // A tool result belongs to the group that issued its call.
    const isToolResult = message.role === 'tool';
    if (isToolResult && previous) {
      previous.messages.push(message);
      previous.tokens += estimate(message);
      continue;
    }
    groups.push({ messages: [message], tokens: estimate(message) });
  }

  return groups;
}

function flatten(groups: MessageGroup[]): ModelMessage[] {
  return groups.flatMap((group) => group.messages);
}

/**
 * The newest groups that fit in `keepRecentTokens`, always at least one, and
 * the index of the first message they hold.
 */
function recentTail(
  messages: ModelMessage[],
  keepRecentTokens: number,
  estimate: (m: ModelMessage) => number,
): { kept: MessageGroup[]; cut: number } {
  const groups = groupMessages(messages, estimate);
  const kept: MessageGroup[] = [];
  let spent = 0;
  // Backwards, so the newest exchange is always the one that survives.
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i];
    if (spent + group.tokens > keepRecentTokens && kept.length > 0) break;
    spent += group.tokens;
    kept.unshift(group);
  }
  return { kept, cut: messages.length - flatten(kept).length };
}

// ── Strategies ──────────────────────────────────────────────────────────────

export interface EvictOldestOptions {
  /** Tokens of recent conversation to keep. Defaults to half the budget. */
  keepRecentTokens?: number;
  /** Stands in for what was dropped, so the model knows the history is cut. */
  marker?: (droppedCount: number) => string;
}

const defaultMarker = (dropped: number) =>
  `[Earlier in this conversation, ${dropped} message${dropped === 1 ? ' was' : 's were'} omitted to stay within the context window.]`;

/**
 * Drop the oldest groups, keep the recent tail, leave a marker in their place.
 *
 * The cheapest strategy: no model call, no latency. The marker matters more
 * than it looks — without it the model sees a conversation that appears to
 * begin mid-thought and will sometimes apologise for losing track.
 */
export function evictOldest(options: EvictOldestOptions = {}): CompactionStrategy {
  const marker = options.marker ?? defaultMarker;

  return (messages, ctx) => {
    const keepRecentTokens = options.keepRecentTokens ?? Math.floor(ctx.maxTokens / 2);
    const { kept, cut } = recentTail(messages, keepRecentTokens, ctx.estimateTokens);
    if (cut <= 0) return null;

    return [
      { role: 'user', content: marker(cut) },
      ...flatten(kept),
    ];
  };
}

export interface ClearToolResultsOptions {
  /** How many recent tool results keep their full content. */
  keepRecentToolResults?: number;
  stub?: string;
}

/**
 * Replace the content of older tool results with a stub, keeping every message
 * and every call/result pairing exactly where it was.
 *
 * The conversation's shape does not change, so this is the least destructive
 * option: the model still sees that it searched and got an answer, only not
 * what the answer was. Cheap, and targeted at the largest thing in an agent
 * loop.
 */
export function clearToolResults(options: ClearToolResultsOptions = {}): CompactionStrategy {
  const keep = options.keepRecentToolResults ?? 3;
  const stub = options.stub ?? '[Tool result omitted to stay within the context window.]';

  return (messages) => {
    const toolIndexes: number[] = [];
    messages.forEach((message, i) => {
      if (message.role === 'tool') toolIndexes.push(i);
    });

    const clearable = toolIndexes.slice(0, Math.max(0, toolIndexes.length - keep));
    if (clearable.length === 0) return null;

    const clearSet = new Set(clearable);
    let changed = false;
    const next = messages.map((message, i) => {
      if (!clearSet.has(i)) return message;
      if (message.content === stub) return message;
      changed = true;
      return { ...message, content: stub };
    });

    return changed ? next : null;
  };
}

/**
 * A summary kept between requests: what it says, and which messages it stands
 * for (the first `covered`, as `fingerprint` describes them).
 */
export interface Checkpoint {
  covered: number;
  fingerprint: string;
  summary: string;
}

/** Where one conversation's checkpoint lives between its requests. */
export interface CheckpointStore {
  get(): Checkpoint | undefined;
  set(checkpoint: Checkpoint): void;
}

export interface SummarizeOldestOptions {
  /**
   * Turns messages into a summary. One model call. Given the summary already
   * held for the messages before them, it folds the new ones into it.
   */
  summarize: (messages: ModelMessage[], previous: string | null) => Promise<string>;
  keepRecentTokens?: number;
  /** Which role carries the summary. `user` is the safest default here. */
  summaryRole?: 'user' | 'assistant';
  /**
   * Keeps the summary for the conversation's next request. The app sends the
   * whole conversation every time, so without it every request past the
   * budget, each tool round trip included, wrote the summary again from the
   * start: a model call per request, and a summary that could say something
   * different each time.
   */
  checkpoints?: CheckpointStore;
}

/** What leads the messages once a summary has taken the place of their start. */
export function summaryContent(summary: string): string {
  return `[Your own note on the earlier part of this conversation, which is no longer in front of you]\n${summary}`;
}

/**
 * Where the messages in front of this request stand against the checkpoint:
 * the checkpoint, and the index from which nothing it covers remains.
 *
 * Two ways it can apply. An earlier request left it, and the conversation
 * still starts with the messages it covers (the app re-sends all of them). Or
 * this request has compacted already, in an earlier step of the agent loop,
 * and its summary is the first message: TanStack carries on from the
 * compacted messages, not the ones the app sent.
 */
function checkpointFor(
  store: CheckpointStore | undefined,
  messages: ModelMessage[],
  summaryRole: ModelMessage['role'],
): { checkpoint: Checkpoint; start: number } | undefined {
  const checkpoint = store?.get();
  if (!checkpoint || checkpoint.covered <= 0) return undefined;

  const head = messages[0];
  if (head?.role === summaryRole && head.content === summaryContent(checkpoint.summary)) {
    return { checkpoint, start: 1 };
  }

  if (checkpoint.covered >= messages.length) return undefined;
  // A cut never lands on a tool result; one here means the messages moved.
  if (messages[checkpoint.covered].role === 'tool') return undefined;
  const same = fingerprintMessages(messages.slice(0, checkpoint.covered)) === checkpoint.fingerprint;
  return same ? { checkpoint, start: checkpoint.covered } : undefined;
}

/**
 * Keep the gist of the old turns instead of discarding them.
 *
 * The expensive strategy — it costs one model call per compaction — and the
 * only one that preserves what was actually said early in a conversation. For
 * this app that is the point: a reading companion whose value is continuity
 * should not forget the book you told it about two hundred messages ago.
 *
 * With a checkpoint store it works the way pi and opencode do: the summary is
 * a checkpoint that later requests reuse as long as it and the messages since
 * it fit, and when they no longer do, only the messages since it are folded
 * in. Cutting back to `keepRecentTokens` (half the budget) each time is what
 * leaves room for the conversation to grow before the next model call.
 *
 * If the summarize call fails, the messages are returned unchanged rather than
 * dropped. Compaction failing open means one over-long request, which the
 * provider reports; compaction failing *closed* by discarding history would
 * silently lie about the conversation. `withCompaction` escalates to a
 * cheaper strategy when composed, so a failure here is usually recoverable.
 */
export function summarizeOldest(options: SummarizeOldestOptions): CompactionStrategy {
  const summaryRole = options.summaryRole ?? 'user';
  const withSummary = (summary: string, rest: ModelMessage[]): ModelMessage[] => [
    { role: summaryRole, content: summaryContent(summary) },
    ...rest,
  ];

  return async (messages, ctx) => {
    const keepRecentTokens = options.keepRecentTokens ?? Math.floor(ctx.maxTokens / 2);
    const held = checkpointFor(options.checkpoints, messages, summaryRole);
    const previous = held?.checkpoint;
    // Messages before `start` are what the held summary already stands for.
    const start = held?.start ?? 0;
    const reused = previous && withSummary(previous.summary, messages.slice(start));
    if (reused && totalTokens(reused, ctx.estimateTokens) <= ctx.maxTokens) return reused;

    const { cut } = recentTail(messages, keepRecentTokens, ctx.estimateTokens);
    // Nothing new to fold in: the held summary is the best this can do.
    if (cut <= start) return reused ?? null;

    const folded = messages.slice(start, cut);
    let summary: string;
    try {
      summary = (await options.summarize(folded, previous?.summary ?? null)).trim();
    } catch (err) {
      console.warn('[Compaction] summarizeOldest failed, leaving history intact:', err);
      return reused ?? null;
    }
    if (!summary) return reused ?? null;

    // Counted against the conversation the app sent, whichever way in.
    options.checkpoints?.set({
      covered: (previous?.covered ?? 0) + folded.length,
      fingerprint: extendFingerprint(previous?.fingerprint ?? '', folded),
      summary,
    });
    return withSummary(summary, messages.slice(cut));
  };
}

/**
 * Run strategies in order, stopping as soon as the result is under budget.
 *
 * Put the cheap, targeted strategy first and the broad fallback last: clear
 * old tool output, and only start losing turns if that was not enough.
 */
export function composeStrategies(...strategies: CompactionStrategy[]): CompactionStrategy {
  return async (messages, ctx) => {
    let current = messages;
    let changed = false;

    for (const strategy of strategies) {
      if (totalTokens(current, ctx.estimateTokens) <= ctx.maxTokens) break;
      const next = await strategy(current, ctx);
      if (next) {
        current = next;
        changed = true;
      }
    }

    return changed ? current : null;
  };
}

// ── Middleware ──────────────────────────────────────────────────────────────

export interface WithCompactionOptions {
  /** Compact once the estimate across messages passes this. */
  maxTokens: number;
  strategy?: CompactionStrategy;
  estimateTokens?: (message: ModelMessage) => number;
  onCompact?: (info: CompactionInfo) => void;
}

/**
 * Shrinks provider context before each model call.
 *
 * Hooks `onConfig`, which fires at init and at the start of every agent
 * iteration — so a conversation that grows during a tool loop is re-checked
 * between iterations rather than only once at the top of the request.
 */
export function withCompaction(options: WithCompactionOptions): ChatMiddleware {
  const estimate = options.estimateTokens ?? estimateMessageTokens;
  const strategy = options.strategy ?? evictOldest();

  return {
    name: 'compaction',
    onConfig: async (_ctx, config) => {
      const before = totalTokens(config.messages, estimate);
      if (before <= options.maxTokens) return;

      const compacted = await strategy(config.messages, {
        maxTokens: options.maxTokens,
        estimateTokens: estimate,
      });
      if (!compacted) return;

      const after = totalTokens(compacted, estimate);
      options.onCompact?.({
        before,
        after,
        messagesBefore: config.messages.length,
        messagesAfter: compacted.length,
      });

      return { messages: compacted };
    },
  };
}
