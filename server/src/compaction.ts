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
 * If the pin ever reaches 0.52, this file can be deleted in favour of the
 * package; the option names were kept identical so that swap is mechanical.
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

  // Arguments to a tool call are sent verbatim and are frequently the largest
  // thing in an assistant message.
  if (message.toolCalls?.length) parts.push(JSON.stringify(message.toolCalls));

  return parts.join('\n');
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
    const groups = groupMessages(messages, ctx.estimateTokens);

    const kept: MessageGroup[] = [];
    let spent = 0;
    // Backwards, so the newest exchange is always the one that survives.
    for (let i = groups.length - 1; i >= 0; i--) {
      const group = groups[i];
      if (spent + group.tokens > keepRecentTokens && kept.length > 0) break;
      spent += group.tokens;
      kept.unshift(group);
    }

    const droppedGroups = groups.length - kept.length;
    if (droppedGroups <= 0) return null;

    const droppedMessages = messages.length - flatten(kept).length;
    return [
      { role: 'user', content: marker(droppedMessages) },
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

export interface SummarizeOldestOptions {
  /** Turns the dropped messages into prose. One model call. */
  summarize: (messages: ModelMessage[]) => Promise<string>;
  keepRecentTokens?: number;
  /** Which role carries the summary. `user` is the safest default here. */
  summaryRole?: 'user' | 'assistant';
}

/**
 * Keep the gist of the old turns instead of discarding them.
 *
 * The expensive strategy — it costs one model call per compaction — and the
 * only one that preserves what was actually said early in a conversation. For
 * this app that is the point: a reading companion whose value is continuity
 * should not forget the book you told it about two hundred messages ago.
 *
 * If the summarize call fails, the messages are returned unchanged rather than
 * dropped. Compaction failing open means one over-long request, which the
 * provider reports; compaction failing *closed* by discarding history would
 * silently lie about the conversation. `withCompaction` escalates to a
 * cheaper strategy when composed, so a failure here is usually recoverable.
 */
export function summarizeOldest(options: SummarizeOldestOptions): CompactionStrategy {
  const summaryRole = options.summaryRole ?? 'user';

  return async (messages, ctx) => {
    const keepRecentTokens = options.keepRecentTokens ?? Math.floor(ctx.maxTokens / 2);
    const groups = groupMessages(messages, ctx.estimateTokens);

    const kept: MessageGroup[] = [];
    let spent = 0;
    for (let i = groups.length - 1; i >= 0; i--) {
      const group = groups[i];
      if (spent + group.tokens > keepRecentTokens && kept.length > 0) break;
      spent += group.tokens;
      kept.unshift(group);
    }

    const droppedGroups = groups.slice(0, groups.length - kept.length);
    if (droppedGroups.length === 0) return null;

    const dropped = flatten(droppedGroups);
    let summary: string;
    try {
      summary = await options.summarize(dropped);
    } catch (err) {
      console.warn('[Compaction] summarizeOldest failed, leaving history intact:', err);
      return null;
    }

    if (!summary.trim()) return null;

    return [
      {
        role: summaryRole,
        content: `[Summary of the earlier part of this conversation]\n${summary.trim()}`,
      },
      ...flatten(kept),
    ];
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
