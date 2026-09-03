import { ChatClient, clientTools, xhrHttpStream, type UIMessage } from '@tanstack/ai-client';
import type { StreamChunk } from '@tanstack/ai/client';
import {
  COMPASS_APPROVAL_REQUIRED_TOOLS,
  addBookToCollectionTool,
  addToQueueTool,
  createCollectionTool,
  deleteHighlightTool,
  deleteThoughtTool,
  listChaptersTool,
  listCollectionsTool,
  markAsFinishedTool,
  readChapterTool,
  removeBookFromCollectionTool,
  removeFromCurrentlyReadingTool,
  removeFromQueueTool,
  reorderQueueTool,
  searchHighlightsTool,
  searchJourneyTool,
  searchReadingTool,
  searchThoughtsTool,
  suggestHighlightTool,
  suggestNextBookTool,
  suggestThoughtTool,
  tagHighlightTool,
  tagThoughtTool,
  getCompassStatusTool,
  getTodayTool,
  getTrackableHistoryTool,
  logTrackableTool,
  proposeAdjustmentsTool,
  proposeGoalTool,
  toggleFavoriteTool,
} from 'samwell-shared';

import {
  executeToolCall,
  formatToolResultForLLM,
  toolStatus,
  type BookCandidate,
  type ChapterListing,
  type CollectionSummary,
  type ReadingSearchResult,
  type SearchResult,
  type ToolCallContext,
} from '@/services/chat-tools';
import { isToolCallMessage } from '@/services/chat-transcript';
import { buildJourneySnapshot } from '@/services/journey';
import {
  formatCompassStatus,
  formatToday,
  formatTrackableHistory,
  runLogTrackable,
  runProposeAdjustments,
  runProposeGoal,
} from '@/services/compass-tools';
import { TOOL_RESULT_TOKEN_BUDGET } from '@/services/tool-limits';
import { useApprovalStore } from '@/stores/approval';
import { useSettingsStore } from '@/stores/settings';

type StoredChatMessage = {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  createdAt: string;
};

type ApprovalRequest = {
  id: string;
  toolName: string;
  input: unknown;
};

export interface CloudChatTurnOptions {
  baseUrl: string;
  deviceId: string;
  modelId: string;
  sessionId: string;
  bookId: string | null;
  /**
   * Which Samwell is answering.
   *
   * `reading` is the library companion; `compass` is the same person turned
   * toward the user's goal, carrying the Compass tools instead of the library
   * ones. Everything else about the turn — the transport, the streaming, the
   * approvals, the reasoning — is deliberately identical, because the two
   * surfaces were only ever supposed to differ by what he is focused on.
   */
  mode?: 'reading' | 'compass';
  history: StoredChatMessage[];
  content: string;
  onStreamingContent: (content: string) => void;
  /**
   * The model's reasoning so far, as one growing string.
   *
   * The whole trace rather than a delta, so the caller stores what it is given
   * instead of accumulating a second copy of it.
   */
  onThinkingContent: (content: string) => void;
  /** `name` is the tool the status describes, so the caller can pick a
   *  matching indicator; both are null when the run ends. */
  onToolStatus: (status: string | null, name: string | null) => void;
}

/**
 * Who they are, refreshed every turn.
 *
 * Built here rather than by each caller so both surfaces send the same thing,
 * and rebuilt per turn rather than persisted into the transcript, because it
 * is a synthesis of the library and the logs as they are NOW. A copy frozen
 * into a session at creation would still be describing a book they finished
 * months ago as "currently reading".
 *
 * This is the whole of what travels automatically. Everything else Samwell
 * knows about them he has to ask for, which is what keeps a request the size
 * of the question rather than the size of their history.
 *
 * Cloud only, and only ever from here: the on-device path sends no journey at
 * all, and carries no tool that could fetch one.
 */
function journeyMessages(mode: 'reading' | 'compass'): UIMessage[] {
  let snapshot = '';
  try {
    /*
     * Compass gets the reading half only. Its own tools report the goal, the
     * trackables and the consistency properly — with ids, schedules, pauses
     * and the real ratio — and a second, cruder description of the same
     * numbers in the system prompt is how Samwell ends up quoting a figure
     * that disagrees with the Insights screen. Reading chat keeps the goal
     * lines, since it has no Compass tools to ask with and orientation is all
     * it needs them for.
     */
    snapshot = buildJourneySnapshot({ includeCompass: mode === 'reading' });
  } catch {
    // A journey that cannot be built is not a reason to lose the turn.
    return [];
  }
  if (!snapshot) return [];

  return [
    {
      id: 'samwell-journey',
      role: 'system',
      createdAt: new Date(),
      parts: [
        {
          type: 'text',
          content:
            'The user\'s journey so far (use it for continuity and to ground what you ' +
            `suggest; never assume beyond it):\n${snapshot}`,
        },
      ],
    },
  ];
}

function toUIMessage(message: StoredChatMessage): UIMessage | null {
  if (message.role === 'tool' || isToolCallMessage(message.content)) {
    return null;
  }

  return {
    id: message.id,
    role: message.role,
    createdAt: new Date(message.createdAt),
    parts: [{ type: 'text', content: message.content }],
  };
}

function textFromMessage(message: UIMessage | undefined): string {
  if (!message) return '';
  return message.parts
    .filter((part): part is { type: 'text'; content: string } => part.type === 'text')
    .map((part) => part.content)
    .join('');
}

/**
 * The text of the message being written right now.
 *
 * The whole-transcript scan this replaces was the tool-status bug: mid-turn,
 * after a model has narrated a line and then called a tool, every reasoning
 * delta re-triggered a messages change, the scan kept finding the *earlier*
 * narrated text, and each hit cleared the tool status and pushed the stale
 * line back into the bubble — so the orb blinked out the moment the model
 * started thinking again. Only the last assistant message is being written;
 * only its text is the stream.
 */
function activeAssistantText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) continue;
    if (message.role === 'user') return '';
    if (message.role === 'assistant') return textFromMessage(message);
  }
  return '';
}

function latestAssistantText(messages: UIMessage[]): string {
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      lastUserIndex = i;
      break;
    }
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    if (i <= lastUserIndex) return '';
    const message = messages[i];
    if (message?.role !== 'assistant') continue;
    const text = textFromMessage(message);
    if (text.trim()) return text;
  }
  return '';
}

/**
 * A leading-and-trailing throttle, for the two callbacks that fire per token.
 *
 * A minute-long reasoning trace is a big string, and rendering it on every
 * delta saturated the JS thread — the "Compass hangs when the model thinks for
 * a minute" report. Four to twenty updates a second is beyond what an eye can
 * follow and costs a fraction of the frames. `flush` delivers the pending
 * value immediately, at the moments ordering matters: a tool status must not
 * land behind a trace update, and the final text must be on screen before the
 * turn is committed into the transcript.
 */
function createThrottle(fn: (value: string) => void, intervalMs: number) {
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRun = 0;

  const run = () => {
    timer = null;
    lastRun = Date.now();
    const value = pending;
    pending = null;
    if (value !== null) fn(value);
  };

  const throttled = (value: string) => {
    pending = value;
    if (timer) return;
    const sinceLast = Date.now() - lastRun;
    if (sinceLast >= intervalMs) run();
    else timer = setTimeout(run, intervalMs - sinceLast);
  };

  throttled.flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending !== null) run();
  };

  /** Drops whatever is pending. A turn that has ended owns no more writes:
   *  a trailing timer firing after the store committed the message would
   *  push the text back into `streamingContent` as a ghost bubble. */
  throttled.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending = null;
  };

  return throttled;
}

/**
 * Cloud adds two states device does not have: approval gates that hold before
 * the work starts. Everything else defers to the shared table, so the two
 * runtimes cannot describe the same tool differently.
 */
function statusForTool(toolName: string): string {
  if (toolName.startsWith('delete_')) return 'Waiting for delete approval…';
  if (toolName.startsWith('tag_')) return 'Waiting for tag approval…';
  if (COMPASS_APPROVAL_REQUIRED_TOOLS.has(toolName)) return 'Waiting for your confirmation…';
  return toolStatus(toolName);
}

/**
 * Compass's tools.
 *
 * Thin on purpose: the work is in `compass-tools.ts`, which reads the same
 * engines the Compass screens read, so a number Samwell quotes and a number on
 * the Insights sheet cannot disagree.
 */
/**
 * The journey-notes tool, defined once and handed to both factories.
 *
 * Cloud only, by construction: it exists nowhere in the on-device tool
 * catalogue, so there is no window size at which an offline model can reach
 * the user's journey memory.
 */
function journeyTool(ctx: ToolCallContext) {
  return searchJourneyTool.client(async (input) => {
    const { result } = await executeToolCall('search_journey', input, ctx);
    return { formatted: typeof result === 'string' ? result : '' };
  });
}

function createCompassClientTools(ctx: ToolCallContext) {
  return clientTools(
    getCompassStatusTool.client(async () => ({ formatted: formatCompassStatus() })),
    getTodayTool.client(async () => ({ formatted: formatToday() })),
    getTrackableHistoryTool.client(async (input) => ({
      formatted: formatTrackableHistory(input.trackable_id, input.days),
    })),
    logTrackableTool.client(async (input) => runLogTrackable(input)),
    proposeGoalTool.client(async (input) => runProposeGoal(input)),
    proposeAdjustmentsTool.client(async (input) => runProposeAdjustments(input)),
    // The same three executors reading chat uses. Two copies of "what does
    // searching the library mean" is exactly the drift CLAUDE.md warns about.
    searchHighlightsTool.client(async (input) => {
      const { result } = await executeToolCall('search_highlights', input, ctx);
      const results = Array.isArray(result) ? (result as SearchResult[]) : [];
      return {
        results,
        formatted: formatToolResultForLLM('search_highlights', results, TOOL_RESULT_TOKEN_BUDGET.cloud),
      };
    }),
    searchThoughtsTool.client(async (input) => {
      const { result } = await executeToolCall('search_thoughts', input, ctx);
      const results = Array.isArray(result) ? (result as SearchResult[]) : [];
      return {
        results,
        formatted: formatToolResultForLLM('search_thoughts', results, TOOL_RESULT_TOKEN_BUDGET.cloud),
      };
    }),
    searchReadingTool.client(async (input) => {
      const { result } = await executeToolCall('search_reading', input, ctx);
      const reading = (result ?? { snippets: [], chapters: [] }) as ReadingSearchResult;
      return {
        results: reading.snippets,
        formatted: formatToolResultForLLM('search_reading', reading, TOOL_RESULT_TOKEN_BUDGET.cloud),
      };
    }),
    journeyTool(ctx),
  );
}

function createSamwellClientTools(ctx: ToolCallContext) {
  return clientTools(
    searchHighlightsTool.client(async (input) => {
      const { result } = await executeToolCall('search_highlights', input, ctx);
      const results = Array.isArray(result) ? (result as SearchResult[]) : [];
      return {
        results,
        formatted: formatToolResultForLLM('search_highlights', results, TOOL_RESULT_TOKEN_BUDGET.cloud),
      };
    }),
    searchThoughtsTool.client(async (input) => {
      const { result } = await executeToolCall('search_thoughts', input, ctx);
      const results = Array.isArray(result) ? (result as SearchResult[]) : [];
      return {
        results,
        formatted: formatToolResultForLLM('search_thoughts', results, TOOL_RESULT_TOKEN_BUDGET.cloud),
      };
    }),
    searchReadingTool.client(async (input) => {
      const { result } = await executeToolCall('search_reading', input, ctx);
      const reading = (result ?? { snippets: [], chapters: [] }) as ReadingSearchResult;
      return {
        results: reading.snippets,
        formatted: formatToolResultForLLM('search_reading', reading, TOOL_RESULT_TOKEN_BUDGET.cloud),
      };
    }),
    listChaptersTool.client(async (input) => {
      const { result } = await executeToolCall('list_chapters', input, ctx);
      const listing = result as ChapterListing | { error: string };
      return {
        chapters: 'error' in listing ? [] : listing.chapters,
        formatted: formatToolResultForLLM('list_chapters', listing, TOOL_RESULT_TOKEN_BUDGET.cloud),
      };
    }),
    readChapterTool.client(async (input) => {
      const { result } = await executeToolCall('read_chapter', input, ctx);
      return {
        formatted: formatToolResultForLLM('read_chapter', result, TOOL_RESULT_TOKEN_BUDGET.cloud),
      };
    }),
    suggestNextBookTool.client(async (input) => {
      const { result } = await executeToolCall('suggest_next_book', input, ctx);
      const candidates = Array.isArray(result) ? (result as BookCandidate[]) : [];
      return {
        candidates,
        formatted: formatToolResultForLLM('suggest_next_book', candidates, TOOL_RESULT_TOKEN_BUDGET.cloud),
      };
    }),
    tagHighlightTool.client(async (input) => {
      const { result } = await executeToolCall('tag_highlight', input, ctx);
      const tagResult = result as { success?: boolean; tags?: string[] };
      return {
        ok: tagResult.success === true,
        id: input.id,
        type: 'highlight' as const,
        tags: tagResult.tags ?? [],
        ...(tagResult.success ? {} : { error: 'Highlight not found.' }),
      };
    }),
    tagThoughtTool.client(async (input) => {
      const { result } = await executeToolCall('tag_thought', input, ctx);
      const tagResult = result as { success?: boolean; tags?: string[] };
      return {
        ok: tagResult.success === true,
        id: input.id,
        type: 'thought' as const,
        tags: tagResult.tags ?? [],
        ...(tagResult.success ? {} : { error: 'Thought not found.' }),
      };
    }),
    deleteHighlightTool.client(async (input) => {
      const { result } = await executeToolCall('delete_highlight', input, ctx);
      const deleteResult = result as { success?: boolean };
      return {
        ok: deleteResult.success === true,
        id: input.id,
        type: 'highlight' as const,
        ...(deleteResult.success ? {} : { error: 'Highlight not found.' }),
      };
    }),
    deleteThoughtTool.client(async (input) => {
      const { result } = await executeToolCall('delete_thought', input, ctx);
      const deleteResult = result as { success?: boolean };
      return {
        ok: deleteResult.success === true,
        id: input.id,
        type: 'thought' as const,
        ...(deleteResult.success ? {} : { error: 'Thought not found.' }),
      };
    }),
    suggestHighlightTool.client(async (input) => {
      const { result } = await executeToolCall('suggest_highlight', input, ctx);
      const suggestResult = result as { ok?: boolean; suggestionId?: string | null; error?: string };
      return {
        ok: suggestResult.ok === true,
        suggestionId: suggestResult.suggestionId ?? null,
        ...(suggestResult.error ? { error: suggestResult.error } : {}),
      };
    }),
    suggestThoughtTool.client(async (input) => {
      const { result } = await executeToolCall('suggest_thought', input, ctx);
      const suggestResult = result as { ok?: boolean; suggestionId?: string | null; error?: string };
      return {
        ok: suggestResult.ok === true,
        suggestionId: suggestResult.suggestionId ?? null,
        ...(suggestResult.error ? { error: suggestResult.error } : {}),
      };
    }),
    removeFromCurrentlyReadingTool.client(async (input) => {
      const { result } = await executeToolCall('remove_from_currently_reading', input, ctx);
      return result as { ok: boolean; succeeded: string[]; failed: { title: string; error: string }[]; error?: string };
    }),
    addToQueueTool.client(async (input) => {
      const { result } = await executeToolCall('add_to_queue', input, ctx);
      return result as { ok: boolean; succeeded: string[]; failed: { title: string; error: string }[]; error?: string };
    }),
    removeFromQueueTool.client(async (input) => {
      const { result } = await executeToolCall('remove_from_queue', input, ctx);
      return result as { ok: boolean; succeeded: string[]; failed: { title: string; error: string }[]; error?: string };
    }),
    reorderQueueTool.client(async (input) => {
      const { result } = await executeToolCall('reorder_queue', input, ctx);
      return result as { ok: boolean; succeeded: string[]; failed: { title: string; error: string }[]; error?: string };
    }),
    toggleFavoriteTool.client(async (input) => {
      const { result } = await executeToolCall('toggle_favorite', input, ctx);
      return result as { ok: boolean; succeeded: string[]; failed: { title: string; error: string }[]; error?: string };
    }),
    markAsFinishedTool.client(async (input) => {
      const { result } = await executeToolCall('mark_as_finished', input, ctx);
      return result as { ok: boolean; succeeded: string[]; failed: { title: string; error: string }[]; error?: string };
    }),
    createCollectionTool.client(async (input) => {
      const { result } = await executeToolCall('create_collection', input, ctx);
      return result as { ok: boolean; collectionId?: string; error?: string };
    }),
    addBookToCollectionTool.client(async (input) => {
      const { result } = await executeToolCall('add_book_to_collection', input, ctx);
      return result as {
        ok: boolean;
        collectionName?: string;
        succeeded: string[];
        failed: { title: string; error: string }[];
        error?: string;
      };
    }),
    removeBookFromCollectionTool.client(async (input) => {
      const { result } = await executeToolCall('remove_book_from_collection', input, ctx);
      return result as {
        ok: boolean;
        collectionName?: string;
        succeeded: string[];
        failed: { title: string; error: string }[];
        error?: string;
      };
    }),
    listCollectionsTool.client(async (input) => {
      const { result } = await executeToolCall('list_collections', input, ctx);
      const collectionList = Array.isArray(result) ? (result as CollectionSummary[]) : [];
      return {
        collections: collectionList,
        formatted: formatToolResultForLLM('list_collections', collectionList, TOOL_RESULT_TOKEN_BUDGET.cloud),
      };
    }),
    journeyTool(ctx),
  );
}

function collectApproval(chunk: StreamChunk): ApprovalRequest | null {
  if (chunk.type !== 'CUSTOM' || chunk.name !== 'approval-requested') return null;
  const value = chunk.value as
    | {
        toolName?: unknown;
        input?: unknown;
        approval?: { id?: unknown };
      }
    | undefined;

  const id = value?.approval?.id;
  const toolName = value?.toolName;
  if (typeof id !== 'string' || typeof toolName !== 'string') return null;
  return { id, toolName, input: value?.input };
}

function readToolName(chunk: StreamChunk): string | null {
  if (chunk.type === 'TOOL_CALL_START') {
    const toolChunk = chunk as StreamChunk & { toolName?: string; toolCallName?: string };
    return toolChunk.toolName ?? toolChunk.toolCallName ?? null;
  }

  if (chunk.type === 'CUSTOM' && chunk.name === 'tool-input-available') {
    const value = chunk.value as { toolName?: unknown } | undefined;
    return typeof value?.toolName === 'string' ? value.toolName : null;
  }

  if (chunk.type === 'CUSTOM' && chunk.name === 'approval-requested') {
    const value = chunk.value as { toolName?: unknown } | undefined;
    return typeof value?.toolName === 'string' ? value.toolName : null;
  }

  return null;
}

// Verified once per app run. A plain fetch to /health isolates the failing hop:
// if this fails while the phone browser reaches the same URL, the app process
// itself cannot use the endpoint (wrong baked-in URL or blocked plain HTTP).
let preflightPassed = false;

export async function preflightCloudServer(baseUrl: string): Promise<void> {
  if (preflightPassed) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Samwell Cloud health check returned HTTP ${res.status} at ${baseUrl}/health`);
    }
    preflightPassed = true;
    console.log(`[Samwell Cloud] Preflight OK: ${baseUrl}/health`);
  } catch (err) {
    if (err instanceof Error && err.message.includes('health check returned')) throw err;
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot reach Samwell Cloud at ${baseUrl} from the app (${detail}). ` +
        'If this exact URL loads in the phone browser, the app cannot use plain HTTP — serve the backend over HTTPS (e.g. cloudflared tunnel) or use adb reverse.',
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function sendCloudChatTurn({
  baseUrl,
  deviceId,
  modelId,
  sessionId,
  bookId,
  mode = 'reading',
  history,
  content,
  onStreamingContent,
  onThinkingContent,
  onToolStatus,
}: CloudChatTurnOptions): Promise<string> {
  /*
   * The reasoning trace, accumulated here rather than in the store, so a
   * re-render of the chat screen cannot lose a delta that arrived between two
   * of them.
   */
  let thinking = '';
  await preflightCloudServer(baseUrl);

  const { cloudReasoningEffort, cloudMaxCompletionTokens } = useSettingsStore.getState();

  const approvals: ApprovalRequest[] = [];
  const initialMessages = [
    ...journeyMessages(mode),
    ...history.map(toUIMessage).filter((message): message is UIMessage => message !== null),
  ];

  /*
   * Progress is what the settle deadline measures, not wall clock. A reasoning
   * model can spend minutes inside one run, and a tool continuation thinks
   * all over again; a deadline set once at the start cut those turns off with
   * "got stuck" while the model was still working. Chunks push the deadline
   * out; a pending approval counts as progress too, since there the turn is
   * waiting on a person, who may take as long as they like.
   */
  const SETTLE_INACTIVITY_MS = 120_000;
  const SETTLE_ABSOLUTE_MS = 600_000;
  let lastProgressAt = Date.now();

  const flushThinking = createThrottle(onThinkingContent, 120);
  const flushStreaming = createThrottle(onStreamingContent, 50);

  const client = new ChatClient({
    id: `samwell-cloud-${sessionId}`,
    threadId: sessionId,
    initialMessages,
    connection: xhrHttpStream(`${baseUrl}/chat/http`, {
      headers: { 'x-samwell-device-id': deviceId },
    }),
    forwardedProps: {
      modelId,
      mode,
      reasoningEffort: cloudReasoningEffort,
      maxCompletionTokens: cloudMaxCompletionTokens,
    },
    tools:
      mode === 'compass'
        ? createCompassClientTools({ sessionId, bookId, runtime: 'cloud' })
        : createSamwellClientTools({ sessionId, bookId, runtime: 'cloud' }),
    onChunk: (chunk) => {
      lastProgressAt = Date.now();

      const approval = collectApproval(chunk);
      if (approval) approvals.push(approval);

      /*
       * Reasoning arrives as its own chunk type, before any answer text. It
       * was being dropped, which is why the cloud half of the app never had a
       * thinking trace while the on-device half did.
       */
      if (chunk.type === 'REASONING_MESSAGE_CONTENT') {
        const delta = (chunk as { delta?: unknown }).delta;
        if (typeof delta === 'string' && delta) {
          thinking += delta;
          flushThinking(thinking);
        }
      }

      const toolName = readToolName(chunk);
      if (toolName) {
        // Ordered ahead of the status: a trace update still in flight must
        // not land after it and leave the row describing the wrong phase.
        flushThinking.flush();
        flushStreaming.flush();
        onToolStatus(statusForTool(toolName), toolName);
      }
      if (chunk.type === 'TOOL_CALL_RESULT') onToolStatus(null, null);
    },
    onMessagesChange: (messages) => {
      const text = activeAssistantText(messages);
      if (text) {
        // The answer is being written; the wait it was covering is over.
        flushThinking.flush();
        onToolStatus(null, null);
        flushStreaming(text);
      }
    },
  });

  try {
    console.log(`[Samwell Cloud] Sending ${mode} request to ${baseUrl}/chat/http`);
    try {
      await client.sendMessage(content);
    } catch (err) {
      console.error('[Samwell Cloud] sendMessage failed:', err, (err as { cause?: unknown })?.cause);
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`${detail} (POST ${baseUrl}/chat/http)`);
    }

    // The server emits client-tool (`tool-input-available`) and approval
    // (`approval-requested`) events AFTER `RUN_FINISHED`. The ChatClient
    // resolves `sendMessage` on `RUN_FINISHED` and processes those follow-on
    // events asynchronously through its subscription loop, which then triggers
    // client-side tool execution and the continuation request. Disposing the
    // client here would tear the subscription down before any of that happens,
    // so the tool never runs and the turn stalls. Keep the client alive until
    // the conversation has fully settled: drain approval requests as they
    // arrive and wait for a final assistant text answer with nothing loading.
    const startedAt = Date.now();
    while (Date.now() - startedAt < SETTLE_ABSOLUTE_MS) {
      if (approvals.length > 0) lastProgressAt = Date.now();
      if (Date.now() - lastProgressAt > SETTLE_INACTIVITY_MS) {
        console.warn('[Samwell Cloud] Turn went quiet; returning partial content.');
        break;
      }

      while (approvals.length > 0) {
        const approval = approvals.shift();
        if (!approval) continue;
        const approved = await useApprovalStore
          .getState()
          .requestApproval({ sessionId, toolName: approval.toolName, input: approval.input });
        await client.addToolApprovalResponse({ id: approval.id, approved });
        lastProgressAt = Date.now();
      }

      if (!client.getIsLoading() && !hasUnresolvedToolCalls(client.getMessages())) {
        const text = latestAssistantText(client.getMessages()).trim();
        if (text) {
          flushThinking.flush();
          flushStreaming.flush();
          return text;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    console.warn('[Samwell Cloud] Turn did not settle before timeout; returning partial content.');
    const partial = latestAssistantText(client.getMessages()).trim();
    return partial || "Samwell got stuck mid-response and couldn't finish. Try again.";
  } finally {
    flushThinking.cancel();
    flushStreaming.cancel();
    client.dispose();
  }
}

function hasUnresolvedToolCalls(messages: UIMessage[]): boolean {
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const part of message.parts) {
      if (part.type === 'tool-call' && (part as { output?: unknown }).output === undefined) {
        return true;
      }
    }
  }
  return false;
}
