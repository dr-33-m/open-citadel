import { ChatClient, clientTools, xhrHttpStream, type UIMessage } from '@tanstack/ai-client';
import type { StreamChunk } from '@tanstack/ai/client';
import {
  COMPASS_APPROVAL_REQUIRED_TOOLS,
  ONBOARDING_APPROVAL_REQUIRED_TOOLS,
  downloadFreeBooksTool,
  explainAppTool,
  findFreeBooksTool,
  finishOnboardingTool,
  setUpLibraryTool,
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
  finishGoalTool,
  logTrackableTool,
  pauseTrackableTool,
  resumeTrackableTool,
  setPrimaryGoalTool,
  stopGoalTool,
  proposeAdjustmentsTool,
  proposeGoalTool,
  toggleFavoriteTool,
} from 'samwell-shared';

import {
  executeToolCall,
  formatToolResultForLLM,
  runExplainApp,
  toolStatus,
  type BookCandidate,
  type ChapterListing,
  type CollectionSummary,
  type ReadingSearchResult,
  type SearchResult,
  type ToolCallContext,
} from '@/services/chat-tools';
import { cloudHeaders } from '@/services/cloud-identity';
import {
  runDownloadFreeBooks,
  runFindFreeBooks,
  runFinishOnboarding,
  runSetUpLibrary,
} from '@/services/onboarding-tools';
import { isToolCallMessage } from '@/services/chat-transcript';
import { buildJourneySnapshot } from '@/services/journey';
import {
  formatCompassStatus,
  formatToday,
  formatTrackableHistory,
  runFinishGoal,
  runLogTrackable,
  runPauseTrackable,
  runResumeTrackable,
  runSetPrimaryGoal,
  runStopGoal,
  runProposeAdjustments,
  runProposeGoal,
} from '@/services/compass-tools';
import { TOOL_RESULT_TOKEN_BUDGET } from '@/services/tool-limits';
import { useApprovalStore } from '@/stores/approval';
import { useSettingsStore } from '@/stores/settings';

/** The three things Samwell can be doing on a cloud turn. */
export type SamwellTurnMode = 'reading' | 'compass' | 'onboarding';

/**
 * Where the turn is posted.
 *
 * Onboarding is a separate route because it is billed separately: it is the
 * free introduction, granted once per account, and it never writes to the
 * usage table. Reading and Compass share the metered route and are told apart
 * by the `mode` forwarded prop.
 */
function endpointFor(mode: SamwellTurnMode, baseUrl: string, metered: boolean): string {
  return mode === 'onboarding' && !metered
    ? `${baseUrl}/onboarding/chat`
    : `${baseUrl}/chat/http`;
}

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
  modelId: string;
  sessionId: string;
  bookId: string | null;
  /**
   * Which Samwell is answering.
   *
   * `reading` is the library companion; `compass` is the same person turned
   * toward the user's goal, carrying the Compass tools instead of the library
   * ones; `onboarding` is him meeting somebody for the first time. Everything
   * else about the turn — the transport, the streaming, the approvals, the
   * reasoning — is deliberately identical, because the surfaces were only ever
   * supposed to differ by what he is focused on.
   *
   * `onboarding` differs in one more way, and it is not about him: it goes to
   * a different route on the server, one the house pays for rather than the
   * reader. See `endpointFor` below.
   */
  mode?: SamwellTurnMode;
  /**
   * Send an onboarding turn down the metered route instead of the free one.
   *
   * Set when the account's free grant is already spent, which happens to
   * somebody who onboarded and then reinstalled or picked up a second device:
   * their phone thinks it is a first run and their account knows better. The
   * conversation is identical — same prompt, same tools, same script — and
   * they are paying for it, which beats refusing to introduce the app to
   * somebody who has just installed it again.
   *
   * Ignored for every other mode, which is metered regardless.
   */
  metered?: boolean;
  /**
   * How long the turn may go without progress before it is given up on.
   *
   * Defaults to two minutes, which covers a reasoning model thinking hard and
   * a tool continuation on top of it. Onboarding raises it, because two of its
   * tools hand off to a SYSTEM file picker: the app goes to the background,
   * nothing streams, and what the clock is actually measuring is a person
   * browsing their own storage looking for where they keep their books. Two
   * minutes is not generous for that, and running out means the turn is
   * abandoned at the exact moment the reader comes back having done what was
   * asked.
   */
  inactivityMs?: number;
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
  /**
   * How long the model spent thinking, in whole seconds, reported once the
   * first answer token lands (or when the turn ends without one). Measured
   * from the first reasoning delta, so it is the wait the reader actually sat
   * through rather than a number taken on trust from the transcript.
   */
  onThinkingDone?: (seconds: number) => void;
  /** `name` is the tool the status describes, so the caller can pick a
   *  matching indicator; both are null when the run ends. */
  onToolStatus: (status: string | null, name: string | null) => void;
  /**
   * Aborts the turn. `stop()` on the two chat surfaces routes here; the turn
   * returns whatever text had streamed so far and no error is raised.
   */
  signal?: AbortSignal;
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
function journeyMessages(mode: SamwellTurnMode): UIMessage[] {
  /*
   * Nothing to carry, and nowhere to carry it to.
   *
   * Onboarding is somebody's first two minutes: there is no reading history,
   * no goal and no journey to summarise. Building one anyway would send an
   * empty scaffold on the one route the house is paying for.
   */
  if (mode === 'onboarding') return [];

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

/** Whether a message is still waiting on a tool it called. */
function hasPendingToolCall(message: UIMessage): boolean {
  return message.parts.some(
    (part) => part.type === 'tool-call' && (part as { output?: unknown }).output === undefined,
  );
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
 *
 * And a message that has called a tool and is waiting on it is not the answer
 * being written — the tool is. Its narration ("Let me check where things
 * stand") is not the reply and returning it here blanks the tool indicator
 * and flashes a bubble that vanishes when the real answer arrives.
 */
/**
 * Everything he has said since the reader last spoke, as one block of text.
 *
 * Not the last assistant message: ALL of them since the last user turn, joined.
 * That distinction is the difference between a turn that reads properly and
 * one that appears to cancel itself.
 *
 * A turn with a tool in it can produce two assistant messages. He narrates
 * what he is about to do, calls the tool, and then the continuation arrives.
 * Whether the continuation lands in the same message or a new one is the
 * provider's business, not ours, and it varies: some write into the message
 * they were already in, others open a fresh one. Reading only the last message
 * meant that on the providers that open a fresh one, the bubble showing the
 * narration was replaced by a short new one that then grew, which is what a
 * reader describes as "it cancelled its message and restreamed". The narration
 * was also dropped from the transcript entirely, so the finished conversation
 * had him doing things he never said he was doing.
 *
 * Accumulating makes the text monotonic under both behaviours. It only ever
 * grows, so the bubble only ever grows.
 */
function assistantTextSinceUser(messages: UIMessage[]): string {
  const said: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) continue;
    if (message.role === 'user') break;
    if (message.role !== 'assistant') continue;
    const text = textFromMessage(message);
    if (text.trim()) said.unshift(text.trim());
  }
  return said.join('\n\n');
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
  // Both of these touch the reader's own files, and one of them deletes. The
  // row says so rather than saying "working", because the thing being waited
  // on is a person deciding whether to let it happen.
  if (ONBOARDING_APPROVAL_REQUIRED_TOOLS.has(toolName)) return 'Waiting for your go-ahead…';
  return toolStatus(toolName);
}

/**
 * Onboarding's tools: the library, the free books, and the way out.
 *
 * Nothing from the reading or Compass catalogues, and that is structural
 * rather than a matter of taste. This is the only conversation where the model
 * has never met the person and cannot be steered by anything it knows about
 * them, so the smaller the surface the fewer ways the first two minutes go
 * somewhere strange.
 *
 * No `ToolCallContext` either, because none of these touch a chat session or
 * a book. They touch the file system.
 */
function createOnboardingClientTools() {
  return clientTools(
    setUpLibraryTool.client(async () => runSetUpLibrary()),
    findFreeBooksTool.client(async (input) => runFindFreeBooks(input)),
    downloadFreeBooksTool.client(async (input) => runDownloadFreeBooks(input)),
    finishOnboardingTool.client(async () => runFinishOnboarding()),
    explainAppTool.client(async () => runExplainApp()),
  );
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
    // The goal's life. Bound here and only here: this factory builds the
    // Compass tool set, so reading chat never sees them.
    finishGoalTool.client(async (input) => runFinishGoal(input)),
    stopGoalTool.client(async (input) => runStopGoal(input)),
    setPrimaryGoalTool.client(async (input) => runSetPrimaryGoal(input)),
    pauseTrackableTool.client(async (input) => runPauseTrackable(input)),
    resumeTrackableTool.client(async (input) => runResumeTrackable(input)),
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
    // The app explaining itself. Bound here because the server offers it on
    // the reading route, and an offered tool with no executor is a turn that
    // hangs waiting for a result nobody is going to produce.
    explainAppTool.client(async () => runExplainApp()),
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
        'If this exact URL loads in the phone browser, the app cannot use plain HTTP. Serve the backend over HTTPS (e.g. cloudflared tunnel) or use adb reverse.',
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function sendCloudChatTurn({
  baseUrl,
  modelId,
  sessionId,
  bookId,
  mode = 'reading',
  metered = false,
  inactivityMs,
  history,
  content,
  onStreamingContent,
  onThinkingContent,
  onThinkingDone,
  onToolStatus,
  signal,
}: CloudChatTurnOptions): Promise<string> {
  /*
   * The reasoning trace, accumulated here rather than in the store, so a
   * re-render of the chat screen cannot lose a delta that arrived between two
   * of them.
   */
  let thinking = '';
  /*
   * Thinking-time measurement. `thinkingStartedAt` is set on the first
   * reasoning delta; `reportThinkingDone` fires `onThinkingDone` once, at the
   * first answer token or when the turn ends, whichever comes first.
   */
  let thinkingStartedAt: number | null = null;
  let thinkingReported = false;
  const reportThinkingDone = () => {
    if (thinkingReported || thinkingStartedAt === null) return;
    thinkingReported = true;
    onThinkingDone?.(Math.max(1, Math.round((Date.now() - thinkingStartedAt) / 1000)));
  };

  // Set from the RUN_FINISHED event so a turn that ended only because it ran
  // out of room can say so, instead of the generic "got stuck".
  let finishReason: string | null = null;

  /*
   * Tool phase: the stretch from the first tool chunk until the model picks
   * up again. The tool itself runs in milliseconds, but a client tool then
   * triggers a whole continuation request — another round trip to the model —
   * and for those seconds nothing streams. Without a held indicator the chat
   * reads as frozen, so the tool's orb and label stay on the row until a
   * reasoning delta or an answer token proves the model is back.
   */
  let inToolPhase = false;
  let lastToolName: string | null = null;
  /*
   * What he had already said when the tool was called, and what he has said
   * since. The pair is how "the model is back" is told apart from "the message
   * list changed for some other reason".
   *
   * Without it the row went blank at the worst possible moment. `onMessagesChange`
   * fires when the tool RESULT is recorded, not only when new words arrive, and
   * the accumulated text at that instant is still the narration from before the
   * call. That is not the model resuming, but it looked like it, so the status
   * was cleared while the continuation request had not even gone out. On the
   * folder pick that is a stretch of several seconds in which the only sign
   * anything is happening is the send button still showing a stop square.
   */
  let saidSoFar = '';
  let saidWhenToolCalled = '';
  const endToolPhase = () => {
    if (!inToolPhase) return;
    inToolPhase = false;
    onToolStatus(null, null);
  };

  await preflightCloudServer(baseUrl);

  const { cloudThinkingBudget } = useSettingsStore.getState();

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
  const SETTLE_INACTIVITY_MS = inactivityMs ?? 120_000;
  const SETTLE_ABSOLUTE_MS = 600_000;
  let lastProgressAt = Date.now();

  const flushThinking = createThrottle(onThinkingContent, 120);
  const flushStreaming = createThrottle(onStreamingContent, 50);

  // Resolved once, here, rather than passed in: who the turn belongs to is
  // not the caller's business, and a fresh `ChatClient` is built per turn, so
  // a token that expired during a long conversation is refreshed on the next
  // message without anything having to notice.
  const headers = await cloudHeaders();

  const client = new ChatClient({
    id: `samwell-cloud-${sessionId}`,
    threadId: sessionId,
    initialMessages,
    connection: xhrHttpStream(endpointFor(mode, baseUrl, metered), {
      headers,
    }),
    forwardedProps:
      mode === 'onboarding' && !metered
        ? // The free route reads none of these. The model is the server's
          // choice because the house is paying for it, and there is no
          // thinking budget to honour because nobody has been shown the
          // setting yet.
          {}
        : {
            modelId,
            mode,
            // One word. The server maps it to a reasoning effort and a coupled
            // reply budget, so a deep think cannot starve the answer.
            thinkingBudget: cloudThinkingBudget,
          },
    tools:
      mode === 'onboarding'
        ? createOnboardingClientTools()
        : mode === 'compass'
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
          // The model is thinking again: the tool phase is over.
          endToolPhase();
          thinkingStartedAt ??= Date.now();
          thinking += delta;
          flushThinking(thinking);
        }
      }

      if (chunk.type === 'RUN_FINISHED') {
        finishReason = (chunk as { finishReason?: string | null }).finishReason ?? null;
        // A finish that is not itself another tool call means the model has
        // stopped talking for this turn — release the held tool row even if
        // the continuation produced no text of its own.
        if (finishReason !== 'tool_calls' && finishReason !== null) endToolPhase();
      }

      const toolName = readToolName(chunk);
      if (toolName) {
        // Ordered ahead of the status: a trace update still in flight must
        // not land after it and leave the row describing the wrong phase. Any
        // half-written narration from before the call is dropped here (the
        // stores blank the bubble on a non-null tool status), so a trailing
        // throttled write must not resurrect it.
        flushThinking.flush();
        flushStreaming.cancel();
        inToolPhase = true;
        lastToolName = toolName;
        saidWhenToolCalled = saidSoFar;
        onToolStatus(statusForTool(toolName), toolName);
      }
      // The tool has returned but the model has not resumed — hold the row on
      // it through the continuation request rather than blanking it.
      if (chunk.type === 'TOOL_CALL_RESULT' && inToolPhase) {
        onToolStatus('Working through that…', lastToolName);
      }
    },
    onMessagesChange: (messages) => {
      const text = assistantTextSinceUser(messages);
      if (!text) return;
      saidSoFar = text;
      // Only genuinely NEW words mean the wait is over. The same text arriving
      // again is the tool result landing, and the row must keep saying what is
      // being waited on. See `saidWhenToolCalled`.
      if (!inToolPhase || text.length > saidWhenToolCalled.length) {
        reportThinkingDone();
        endToolPhase();
      }
      flushThinking.flush();
      flushStreaming(text);
    },
  });

  /*
   * Abort wiring. `client.stop()` tears down the in-flight request and the
   * subscription loop; the settle loop below sees `aborted` and returns
   * whatever streamed so far. No throw — a turn the reader called off is not
   * an error.
   */
  let aborted = signal?.aborted ?? false;
  const onAbort = () => {
    aborted = true;
    /*
     * Resolve any approval this turn is blocked on, or stopping does nothing.
     *
     * The settle loop below waits on `requestApproval`, a promise only the
     * dialog or the onboarding card can settle. `client.stop()` does not touch
     * it, so a reader who pressed stop while Samwell was waiting on them left
     * the promise unresolved: the turn never returned, `submitting` stayed
     * true, and the composer kept showing a stop button that had already been
     * pressed. Declining on their behalf is the honest reading of stop, and it
     * is what happens to the tool call either way.
     */
    useApprovalStore.getState().clearSession(sessionId);
    try {
      client.stop();
    } catch {
      // Already disposed or never started — nothing to stop.
    }
  };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    console.log(`[Samwell Cloud] Sending ${mode} request to ${endpointFor(mode, baseUrl, metered)}`);
    try {
      await client.sendMessage(content);
    } catch (err) {
      // A turn the reader called off rejects here through the aborted request;
      // that is the outcome they asked for, not a failure to report.
      if (aborted) {
        reportThinkingDone();
        return assistantTextSinceUser(client.getMessages()).trim();
      }
      console.error('[Samwell Cloud] sendMessage failed:', err, (err as { cause?: unknown })?.cause);
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`${detail} (POST ${endpointFor(mode, baseUrl, metered)})`);
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
      if (aborted) break;
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
        /*
         * They have answered, so stop saying they have not.
         *
         * `statusForTool` deliberately reports an approval-gated tool as
         * "waiting for your go-ahead", which is true right up until it is not.
         * Past this line the work is the app's, and on `set_up_library` the
         * work is a system folder picker followed by copying every EPUB it
         * found: the longest stretch in onboarding, and it was labelled as
         * though it were still waiting on the reader.
         */
        if (approved) onToolStatus(toolStatus(approval.toolName), approval.toolName);
        lastProgressAt = Date.now();
      }

      // `inToolPhase` covers the gap between a tool returning and the
      // continuation request starting, where `isLoading` briefly drops and
      // the only assistant text is the pre-tool narration — returning there
      // ends the turn on "Let me check…" instead of the real answer.
      if (
        !inToolPhase &&
        !client.getIsLoading() &&
        !hasUnresolvedToolCalls(client.getMessages())
      ) {
        const text = assistantTextSinceUser(client.getMessages()).trim();
        if (text) {
          reportThinkingDone();
          flushThinking.flush();
          flushStreaming.flush();
          return text;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    reportThinkingDone();
    // Whatever streamed, and nothing else. A turn that did not finish leaves
    // the reader where they were, free to send again or stop it themselves —
    // a canned "he got stuck" bubble dropped into the transcript reads worse
    // than the quiet, and it is the reader's call, not the app's.
    const partial = assistantTextSinceUser(client.getMessages()).trim();
    if (!partial) {
      console.warn(
        `[Samwell Cloud] Turn produced no answer (finishReason=${finishReason ?? 'none'}, aborted=${aborted}).`,
      );
    }
    return partial;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    flushThinking.cancel();
    flushStreaming.cancel();
    client.dispose();
  }
}

function hasUnresolvedToolCalls(messages: UIMessage[]): boolean {
  return messages.some((message) => message.role === 'assistant' && hasPendingToolCall(message));
}
