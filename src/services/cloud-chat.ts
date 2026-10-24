import { ChatClient, clientTools, xhrHttpStream, type UIMessage } from '@tanstack/ai-client';
import type { StreamChunk } from '@tanstack/ai/client';
import {
  COMPASS_APPROVAL_REQUIRED_TOOLS,
  ONBOARDING_APPROVAL_REQUIRED_TOOLS,
  ONBOARDING_FEEDS_PROP,
  explainAppTool,
  addNoteToHighlightTool,
  clearQueueTool,
  deleteBookTool,
  deleteCollectionTool,
  deleteNoteTool,
  renameBookTool,
  startReadingTool,
  updateNoteTool,
  updateThoughtTool,
  getBookDetailsTool,
  searchLibraryTool,
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
  listMyPodcastsTool,
  searchPodcastEpisodesTool,
  getPodcastEpisodeTool,
  listMyBlogsTool,
  searchBlogPostsTool,
  TOOL_LOOP_CEILING,
} from 'samwell-shared';

import {
  executeToolCall,
  formatToolResultForLLM,
  runExplainApp,
  toolStatus,
  type BookCandidate,
  type SearchResult,
  type ToolCallContext,
} from '@/services/chat-tools';
import type { ChapterListing, ReadingSearchResult } from '@/services/reading-tools';
import { ArrowRight } from '@/components/icons';
import { showToast } from '@/components/toast/toast-provider';
import { cloudHeaders } from '@/services/cloud-identity';
import { createSmoothReveal } from '@/services/smooth-reveal';
import { createReplySequence, replySegments } from '@/services/reply-sequence';
import { createStreamTiming } from '@/services/stream-timing';
import { createRequestResume } from '@/services/cloud-turn-resume';
import { reportCloudReached, reportCloudUnreached } from '@/lib/network';
import { createCircleWatch } from '@/utils/tool-circling';
import { createOnboardingClientTools } from '@/services/onboarding-tools/client-tools';
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
import {
  runGetPodcastEpisode,
  runListMyBlogs,
  runListMyPodcasts,
  runSearchBlogPosts,
  runSearchPodcastEpisodes,
} from '@/services/listening-tools';
import { formatLibrarySearch, type CollectionListing, type LibraryBook } from '@/services/library-format';
import { earlierToolUseNote } from '@/utils/earlier-tool-use';
import { NO_ACTIVITY, sameActivity, turnActivity, type TurnActivity } from '@/utils/turn-activity';
import { useApprovalStore } from '@/stores/approval';
import { useSettingsStore } from '@/stores/settings';

/** The three things Samwell can be doing on a cloud turn. */
/** One key for every cloud turn that did not go through, so a second failure writes over the first. */
const TURN_FAILED_TOAST = 'cloud-turn-failed';
const TURN_FAILED_MESSAGE = 'Samwell could not answer just now. Try again.';
const UNREACHABLE_MESSAGE = 'Samwell Cloud could not be reached. Check your connection and try again.';

/**
 * The phone could not reach Samwell Cloud at all: offline, no DNS, the server
 * down. Its message keeps the detail for the log; the reader is told only
 * that the connection is the problem.
 */
export class CloudUnreachable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudUnreachable';
  }
}

/**
 * Whether a turn failed because the server could not be reached. The first
 * turn of a run finds out in the health check (`CloudUnreachable`); a later
 * one from the stream itself, whose transport says only "XHR request failed"
 * when the request never got an answer.
 */
export function isCloudUnreachable(error: unknown): boolean {
  if (error instanceof CloudUnreachable) return true;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /XHR request failed|Network request failed/i.test(message);
}

/** What a stream that closed before its end is reported as. See `isEarlyClose`. */
const DROPPED_MESSAGE = 'XHR request failed: the stream closed before the run finished';

/**
 * A request that failed in a way worth sending again: it got no answer, its
 * stream was cut, or a gateway in front of the server could not reach it.
 * Never a refusal (402, 429) or the server's own failure: sending those again
 * gets the same answer.
 */
function isWorthResuming(error: unknown): boolean {
  if (isCloudUnreachable(error)) return true;
  if (error instanceof Error && error.name === 'StreamTruncatedError') return true;
  const status = readStatus(error);
  return status === 502 || status === 503 || status === 504;
}

/**
 * The connection closed, cleanly, before the server said the run was over.
 *
 * TanStack's transport covers for that with a finish of its own, marked
 * `connect-wrapper` and saying "stop", so a stream cut off mid-answer read as
 * an answer that had finished: the orb went out, the send button came back
 * and nothing was said. It is a dropped connection and is treated as one.
 */
function isEarlyClose(chunk: StreamChunk): boolean {
  return chunk.type === 'RUN_FINISHED' && (chunk as { model?: unknown }).model === 'connect-wrapper';
}

/** One key for the notice that a long turn paused, so a second writes over the first. */
const TURN_PAUSED_TOAST = 'cloud-turn-paused';

/** Why a turn stopped before Samwell had finished. */
export type TurnPause = 'circling' | 'ceiling' | 'quiet';

const PAUSE_MESSAGES: Record<TurnPause, string> = {
  circling: 'Samwell was going over the same ground, so he paused.',
  ceiling: 'Samwell paused after a long run of work.',
  quiet: 'Samwell went quiet, so he paused.',
};

/**
 * Says that a turn stopped before he had finished, and offers to carry on.
 *
 * It used to end in silence: the orb went out, the send button came back and
 * nothing was said, which on a long job looks exactly like a crash. Carrying
 * on is a new message, so the turn's counts start again and the server
 * checks the credit ceiling afresh, which is the honest place for a long job
 * to ask for more.
 */
export function sayTurnPaused(reason: TurnPause, keepGoing: () => void): void {
  showToast({
    key: TURN_PAUSED_TOAST,
    message: PAUSE_MESSAGES[reason],
    actionIcon: ArrowRight,
    actionLabel: 'Keep going',
    onActionPress: keepGoing,
    persistent: true,
  });
}

/** What carrying on sends, as the reader's own message. */
export const KEEP_GOING_MESSAGE = 'Keep going.';

/**
 * Samwell Cloud refused the turn, and why.
 *
 * The transport throws a plain `Error` whose message carries the status and
 * nothing else (`XHR error! status: 402 ...`), so the status is read back out
 * of it here - once, in the one place that knows the shape - rather than
 * every caller matching on a substring. `stores/chat` already did that for
 * `429` and it is exactly the copy that drifts.
 *
 * The numbers are deliberately not carried: the response body is gone by the
 * time this throws, and the subscription store already holds a balance that
 * is at least as fresh.
 */
export class CloudRefused extends Error {
  constructor(
    readonly reason: 'noCredits' | 'noPlan' | 'busyTurn',
    message: string,
  ) {
    super(message);
    this.name = 'CloudRefused';
  }
}

/** The HTTP status the transport buried in its message, if there was one. */
function readStatus(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const match = message.match(/status:\s*(\d{3})/);
  return match ? Number(match[1]) : null;
}

/**
 * A refusal, or null if this was an ordinary failure.
 *
 * 402 is the credit gate and 429 is one of the two turn ceilings. Both are
 * the server working correctly, so both get a sentence a reader can act on
 * rather than a stack trace with a number in it.
 */
export function asCloudRefusal(error: unknown): CloudRefused | null {
  if (error instanceof CloudRefused) return error;
  const status = readStatus(error);
  if (status === 402) {
    return new CloudRefused(
      'noCredits',
      'You are out of AI Credits for this month. They renew on your next billing date.',
    );
  }
  if (status === 429) {
    return new CloudRefused(
      'busyTurn',
      'That message went round in circles and Samwell stopped it. Try asking it a different way.',
    );
  }
  return null;
}

/**
 * Says in a toast that a cloud turn failed, for every chat that sends one.
 *
 * A refusal gets its own sentence, since the reader can act on it. Anything
 * else gets one plain line: the transport's or OpenRouter's own text is long
 * and technical, so it goes to the log. It used to be said three ways: a
 * bubble written into the reading chat's transcript with the raw message in
 * it, red text under onboarding's composer, and nothing at all in Compass.
 */
export function sayCloudTurnFailed(error: unknown): void {
  const refusal = asCloudRefusal(error);
  const unreachable = !refusal && isCloudUnreachable(error);
  // Being offline is a state the app is in, not a fault in it, so it is
  // noted rather than raised: `console.error` draws a development build's
  // error overlay over the toast that already says what happened.
  if (unreachable) {
    if (__DEV__) console.log('[Samwell Cloud] Unreachable:', error instanceof Error ? error.message : error);
  } else if (!refusal) {
    console.error('[Samwell Cloud] Turn failed:', error);
  }
  showToast({
    key: TURN_FAILED_TOAST,
    message: refusal?.message ?? (unreachable ? UNREACHABLE_MESSAGE : TURN_FAILED_MESSAGE),
  });
}

/** Says in a toast why a cloud turn was not sent at all (no server, nobody signed in). */
export function sayCloudTurnBlocked(message: string): void {
  showToast({ key: TURN_FAILED_TOAST, message });
}

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
  /** What he did before this reply, said back to him by `earlierToolUseMessages`. */
  activity?: TurnActivity | null;
};

type ApprovalRequest = {
  id: string;
  toolName: string;
  input: unknown;
};

export interface CloudChatTurnOptions {
  baseUrl: string;
  /**
   * The reader's chosen model, or null if they have never chosen one.
   *
   * Null is sent as "unspecified" and the server answers with the plan's own
   * default, so a first turn lands on the right model without waiting for the
   * app to be told what that is.
   */
  modelId: string | null;
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
   * The balance, as the metered route reports it on the way out.
   *
   * The server yields a `samwell-credits` chunk before it finishes, so the
   * new number arrives WITH the reply. Reading it saves a whole authenticated
   * round trip per message, which the app was making every turn to learn
   * something it had already been told.
   */
  onCredits?: (available: number) => void;
  /** Onboarding only: a tool really changed their library. See `onboardingActionNote`. */
  onOnboardingAction?: (note: string) => void;
  /**
   * What he has done this turn so far: each tool call as a step, and the web
   * pages any search found. Called when it changes, read straight from the
   * TanStack messages (`turnActivity`), so a step on the device and a search
   * on the server are drawn the same way.
   */
  onActivity?: (activity: TurnActivity) => void;
  /**
   * A finished stretch of his reply, to keep as its own message. Given, each
   * stretch between two tool calls is a message of its own and the turn
   * returns only the last; without it the turn is one growing bubble. See
   * `createReplySequence`.
   */
  onReplyPart?: (text: string) => void;
  /**
   * The turn stopped before he had finished: he was circling, reached the
   * backstop ceiling, or went quiet. The caller says so and offers to carry
   * on (`sayTurnPaused`). Not called for stop, which the reader chose, or for
   * a failure, which is said as one.
   */
  onPaused?: (reason: TurnPause) => void;
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

/**
 * The lookups behind his earlier replies, which `toUIMessage` leaves out.
 *
 * A system message, as the journey is, so the server lifts it into the system
 * prompts and it never sits in the conversation as words he said. Without it
 * he read his own earlier replies as unchecked and apologised for them. See
 * `earlier-tool-use.ts`. Not in onboarding, which is a fixed script whose
 * prompt the house caches.
 */
function earlierToolUseMessages(mode: SamwellTurnMode, history: StoredChatMessage[]): UIMessage[] {
  if (mode === 'onboarding') return [];
  const note = earlierToolUseNote(history);
  if (!note) return [];
  return [{ id: 'samwell-earlier-tools', role: 'system', createdAt: new Date(), parts: [{ type: 'text', content: note }] }];
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
 * Whether a message is still waiting on a tool it called.
 *
 * A call the reader said no to never gets an output: nothing ran, so nothing
 * came back. Counting it as still open held every turn with a refusal in it
 * on the stop button after the answer had finished, until the quiet timeout
 * gave up two minutes later. A failed call is over the same way.
 */
export function hasPendingToolCall(message: UIMessage): boolean {
  return message.parts.some((part) => {
    if (part.type !== 'tool-call') return false;
    if (part.output !== undefined || part.state === 'error') return false;
    return part.approval?.approved !== false;
  });
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
  // Each of these changes what is on the reader's device, and one of them
  // deletes. The row says so rather than saying "working", because the thing
  // being waited on is a person deciding whether to let it happen.
  if (ONBOARDING_APPROVAL_REQUIRED_TOOLS.has(toolName)) return 'Waiting for your go-ahead…';
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

/**
 * Finding a book and reading what is known about it, defined once and handed
 * to both factories, like the journey tool: what "this book is in the
 * library" means cannot be decided twice.
 */
function libraryLookupTools(ctx: ToolCallContext) {
  return [
    searchLibraryTool.client(async (input) => {
      const { result } = await executeToolCall('search_library', input, ctx);
      const found = result as { books: LibraryBook[]; total: number };
      return {
        books: found.books,
        total: found.total,
        formatted: formatLibrarySearch(found, input.query, TOOL_RESULT_TOKEN_BUDGET.cloud),
      };
    }),
    getBookDetailsTool.client(async (input) => {
      const { result } = await executeToolCall('get_book_details', input, ctx);
      return { formatted: formatToolResultForLLM('get_book_details', result, TOOL_RESULT_TOKEN_BUDGET.cloud) };
    }),
  ] as const;
}

/**
 * The podcasts and blogs, defined once and handed to both factories like the
 * library lookups: what "the shows they follow" means is decided in one place.
 */
function listeningTools() {
  return [
    listMyPodcastsTool.client(async (input) => runListMyPodcasts(input)),
    searchPodcastEpisodesTool.client(async (input) => runSearchPodcastEpisodes(input)),
    getPodcastEpisodeTool.client(async (input) => runGetPodcastEpisode(input)),
    listMyBlogsTool.client(async (input) => runListMyBlogs(input)),
    searchBlogPostsTool.client(async (input) => runSearchBlogPosts(input)),
  ] as const;
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
      const reading = (result ?? { snippets: [], chapters: [], preparing: 0 }) as ReadingSearchResult;
      return {
        results: reading.snippets,
        formatted: formatToolResultForLLM('search_reading', reading, TOOL_RESULT_TOKEN_BUDGET.cloud),
      };
    }),
    ...libraryLookupTools(ctx),
    ...listeningTools(),
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
      const reading = (result ?? { snippets: [], chapters: [], preparing: 0 }) as ReadingSearchResult;
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
      const suggestResult = result as { ok?: boolean; suggestionId?: string | null; passage?: string; error?: string };
      return {
        ok: suggestResult.ok === true,
        suggestionId: suggestResult.suggestionId ?? null,
        ...(suggestResult.passage ? { passage: suggestResult.passage } : {}),
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
      const listing = Array.isArray(result) ? (result as CollectionListing[]) : [];
      return {
        collections: listing.map((collection) => ({
          id: collection.id,
          name: collection.name,
          bookCount: collection.books.length,
          books: collection.books.map(({ id, title, author }) => ({ id, title, author })),
        })),
        formatted: formatToolResultForLLM('list_collections', result, TOOL_RESULT_TOKEN_BUDGET.cloud),
      };
    }),
    ...libraryLookupTools(ctx),
    /*
     * Offered by the server since the toolbox landed and never bound here, so
     * a turn that called one waited for a result that never came. Each is
     * approval-gated in its definition, so binding them adds no step the
     * reader does not confirm. The server now offers only what this list
     * declares (`offered-tools.ts`), which is what kept builds without these
     * from hanging.
     */
    deleteCollectionTool.client(async (input) => {
      const { result } = await executeToolCall('delete_collection', input, ctx);
      return result as { ok: boolean; name?: string; bookCount?: number; error?: string };
    }),
    renameBookTool.client(async (input) => {
      const { result } = await executeToolCall('rename_book', input, ctx);
      return result as { ok: boolean; from?: string; to?: string; error?: string };
    }),
    deleteBookTool.client(async (input) => {
      const { result } = await executeToolCall('delete_book', input, ctx);
      return result as BookBatchResult;
    }),
    clearQueueTool.client(async (input) => {
      const { result } = await executeToolCall('clear_queue', input, ctx);
      return result as BookBatchResult;
    }),
    startReadingTool.client(async (input) => {
      const { result } = await executeToolCall('start_reading', input, ctx);
      return result as BookBatchResult;
    }),
    addNoteToHighlightTool.client(async (input) => {
      const { result } = await executeToolCall('add_note_to_highlight', input, ctx);
      return result as NoteToolResult;
    }),
    updateNoteTool.client(async (input) => {
      const { result } = await executeToolCall('update_note', input, ctx);
      return result as NoteToolResult;
    }),
    deleteNoteTool.client(async (input) => {
      const { result } = await executeToolCall('delete_note', input, ctx);
      return result as NoteToolResult;
    }),
    updateThoughtTool.client(async (input) => {
      const { result } = await executeToolCall('update_thought', input, ctx);
      return result as { ok: boolean; id?: string; type?: 'thought'; error?: string };
    }),
    ...listeningTools(),
    journeyTool(ctx),
  );
}

type BookBatchResult = { ok: boolean; succeeded: string[]; failed: { title: string; error: string }[]; error?: string };
type NoteToolResult = { ok: boolean; noteId?: string; error?: string };

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
    throw new CloudUnreachable(
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
  onCredits,
  onOnboardingAction,
  onReplyPart,
  onActivity,
  onPaused,
  signal,
}: CloudChatTurnOptions): Promise<string> {
  // The last activity handed over, so an unchanged one is not handed over again.
  let activity: TurnActivity = NO_ACTIVITY;
  const reportActivity = (messages: UIMessage[]) => {
    if (!onActivity) return;
    const next = turnActivity(messages);
    if (sameActivity(activity, next)) return;
    activity = next;
    onActivity(next);
  };
  /*
   * The reasoning trace, accumulated here rather than in the store, so a
   * re-render of the chat screen cannot lose a delta that arrived between two
   * of them.
   */
  let thinking = '';
  /*
   * Which reasoning message the trace is in. Each request after a tool thinks
   * in a new one, and running them straight on joined a cut-off sentence to
   * the next round's first ("gentle, insightfulFun request"); a new one starts
   * a new paragraph.
   */
  let reasoningMessageId: string | null = null;
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
   * A failure the server could only send inside the stream (`RUN_ERROR`):
   * by then it has answered 200, so `sendMessage` resolves rather than
   * rejecting. Without this the turn waited out the inactivity window, two
   * minutes of a working orb, and ended with nothing.
   */
  // Typed through a cast so the checks below are not narrowed to `null`: it
  // is set from a callback, which control-flow analysis does not see.
  let streamError = null as Error | null;

  /*
   * Tool phase: the stretch from the first tool chunk until the model picks
   * up again. The tool itself runs in milliseconds, but a client tool then
   * triggers a whole continuation request — another round trip to the model —
   * and for those seconds nothing streams. Without a held indicator the chat
   * reads as frozen, so the tool's orb and label stay on the row until a
   * reasoning delta or an answer token proves the model is back.
   */
  let inToolPhase = false;
  /*
   * Round trips made since the reader spoke.
   *
   * Every one re-sends the whole conversation plus every tool result so far,
   * so the cost of a turn grows with the square of this number rather than
   * with it. The server enforces the same ceiling and is the one that counts
   * (a stale build of this file must not be able to opt out), but it can only
   * refuse - stopping here lets the turn end on whatever Samwell has already
   * said, which is a far better thing to leave a reader holding than an error.
   */
  let continuationsThisTurn = 0;
  // He asked for the same thing again having been given it. See `tool-circling.ts`.
  const circles = createCircleWatch();
  let circling = false;
  // A request that dropped goes again from where it started. See `cloud-turn-resume.ts`.
  const resume = createRequestResume();
  /*
   * Between a dropped request and the first chunk of its second try. The
   * messages were put back to before the drop, and drawing that would show a
   * finished part again in the streaming bubble; what was on screen stays
   * until the new words arrive.
   */
  let resuming = false;
  // Said once per request, not per chunk: the stream is proof the server answers.
  let reachedThisRequest = false;
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
  const streamTiming = createStreamTiming();
  /*
   * `finish_onboarding` has run, so there is nothing left for this turn to do.
   *
   * Enforced here rather than asked for in the prompt, because asking did not
   * work and could not. A client tool returning is not the end of anything to
   * the runner: it posts the result back and the model gets another turn. The
   * onboarding script tells him to end with his goodbye and this call, so on
   * that extra turn he read the same instruction, said goodbye again, and
   * called it again. Round and round, twelve books announced six ways, until
   * the reader pressed stop.
   *
   * A prompt cannot fix that. "Do not call this twice" is one more sentence in
   * the same instruction that is generating the loop, and the loop costs the
   * house a turn each time. The tool that ends the conversation ends the turn.
   */
  let finished = false;
  // His last message, carried in the `finish_onboarding` call itself.
  let farewell = '';
  let signalFinished = () => {};
  const finishedSignal = new Promise<void>((resolve) => {
    signalFinished = resolve;
  });
  const endConversation = (goodbye: string) => {
    finished = true;
    farewell = goodbye.trim();
    signalFinished();
  };
  /*
   * A guard on the call that brought `finish_onboarding` in.
   *
   * That tool never completes (see `createOnboardingClientTools`), and the
   * client waits on any tool still running when a request ends. Today none
   * is: the server sends a client tool after the run finishes, so the request
   * is over before the tool starts. Were that order to change, `sendMessage`
   * or the go-ahead's continuation would wait forever and onboarding would be
   * stuck, so both are let go of the moment he finishes.
   */
  const untilFinished = <T,>(work: Promise<T>) => {
    work.catch(() => {});
    return Promise.race([work, finishedSignal]);
  };
  const endToolPhase = () => {
    if (!inToolPhase) return;
    /*
     * Never while the call is still outstanding, whatever else the stream says.
     *
     * Three things end this phase: the model reasoning again, the run
     * finishing with something other than a tool call, and new words arriving.
     * All three are heuristics for "the model has moved on", and all three were
     * written when a tool call and its execution were milliseconds apart. They
     * are wrong for `set_up_library`, which is a system folder picker followed
     * by copying files: minutes, during which a single stray chunk emptied the
     * status row and left the reader with a stop button and no explanation.
     *
     * Which chunk does it depends on the provider. That is the tell that the
     * guard belonged here rather than at each call site: the runner should not
     * be inferring whether a tool is running when it can simply look.
     */
    if (hasUnresolvedToolCalls(client.getMessages())) return;
    inToolPhase = false;
    showToolStatus(null, null);
  };

  await preflightCloudServer(baseUrl);

  const { cloudThinkingBudget } = useSettingsStore.getState();

  const approvals: ApprovalRequest[] = [];
  const initialMessages = [
    ...journeyMessages(mode),
    ...earlierToolUseMessages(mode, history),
    ...history.map(toUIMessage).filter((message): message is UIMessage => message !== null),
  ];

  /*
   * Progress is what the settle deadline measures, not wall clock. A reasoning
   * model can spend minutes inside one run, and a tool continuation thinks
   * all over again; a deadline set once at the start cut those turns off with
   * "got stuck" while the model was still working. Chunks push the deadline
   * out; a pending approval counts as progress too, since there the turn is
   * waiting on a person, who may take as long as they like.
   *
   * There is no wall clock at all any more. Ten minutes in total was the
   * other half of this, and it cut off long jobs that were making progress
   * the whole time: seven scripts from seven books, on a model that thinks
   * for a minute a step, does not fit in ten. What bounds a turn now is the
   * quiet below, circling (`tool-circling.ts`), the backstop ceiling, and on
   * the server the share of the balance one message may spend.
   */
  const SETTLE_INACTIVITY_MS = inactivityMs ?? 120_000;
  let lastProgressAt = Date.now();

  const flushThinking = createThrottle(onThinkingContent, 120);
  // Paced rather than throttled: a reply released whole is revealed a word
  // at a time. See `createSmoothReveal`.
  const reveal = createSmoothReveal(onStreamingContent);
  // And one thing at a time behind it. See `createReplySequence`.
  const sequence = createReplySequence({ reveal, onPart: onReplyPart });
  const replyParts = (messages: UIMessage[]) =>
    onReplyPart ? replySegments(messages) : [assistantTextSinceUser(messages)];
  /*
   * A tool's status waits for the words before it to finish arriving, so the
   * row (and a card under it) never appears beside a line still being
   * revealed. Clearing it does not wait: new words mean the tool is done.
   * The latest status wins, so a clear is never overtaken by an older one.
   */
  let wantedStatus: [string | null, string | null] = [null, null];
  let turnOver = false;
  let statusQueued = false;
  const showToolStatus = (status: string | null, name: string | null) => {
    wantedStatus = [status, name];
    if (status === null) onToolStatus(null, null);
    if (status === null || statusQueued) return;
    statusQueued = true;
    sequence.then(() => {
      statusQueued = false;
      if (!turnOver) onToolStatus(...wantedStatus);
    });
  };

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
    forwardedProps: {
      ...(mode === 'onboarding' && !metered
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
          }),
      // This build can follow podcasts and blogs, so the server offers them.
      // On both onboarding routes; see `ONBOARDING_FEEDS_PROP`.
      ...(mode === 'onboarding' ? { [ONBOARDING_FEEDS_PROP]: true } : {}),
    },
    tools:
      mode === 'onboarding'
        ? createOnboardingClientTools({
            onFinished: endConversation,
            messages: (): UIMessage[] => client.getMessages(),
            // In order with what he said, not ahead of the line before it.
            onAction: (note) => sequence.then(() => onOnboardingAction?.(note)),
          })
        : mode === 'compass'
          ? createCompassClientTools({ sessionId, bookId, runtime: 'cloud' })
          : createSamwellClientTools({ sessionId, bookId, runtime: 'cloud' }),
    // Each request, as it goes out: the first, and every continuation.
    onResponse: () => {
      reachedThisRequest = false;
      resume.markStart(client.getMessages());
    },
    onError: (error) => {
      streamError = error;
    },
    onChunk: (chunk) => {
      lastProgressAt = Date.now();
      if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') resume.markSettled();
      if (isEarlyClose(chunk)) {
        streamError ??= new Error(DROPPED_MESSAGE);
        return;
      }
      if (chunk.type !== 'RUN_ERROR') {
        resuming = false;
        if (!reachedThisRequest) {
          reachedThisRequest = true;
          reportCloudReached();
        }
      }

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
          /*
           * The model is thinking again. With nothing said yet the tool phase
           * is over: the reasoning panel takes the footer and says so. With
           * words already on screen it is not, because the footer then shows
           * nothing unless a tool is running (`turnIndicator`): GLM said "let
           * me dig through everything", looked six things up, and the row went
           * blank for the seconds it thought before answering. It holds on
           * "Working through that…" until new words arrive or the run ends.
           */
          if (!saidWhenToolCalled) endToolPhase();
          thinkingStartedAt ??= Date.now();
          const messageId = (chunk as { messageId?: unknown }).messageId;
          if (typeof messageId === 'string' && messageId !== reasoningMessageId) {
            if (reasoningMessageId !== null && thinking && !thinking.endsWith('\n\n')) {
              thinking = `${thinking.trimEnd()}\n\n`;
            }
            reasoningMessageId = messageId;
          }
          thinking += delta;
          flushThinking(thinking);
        }
      }

      if (__DEV__ && chunk.type === 'TEXT_MESSAGE_CONTENT') streamTiming.mark();

      if (chunk.type === 'RUN_FINISHED') {
        if (__DEV__) streamTiming.report();
        finishReason = (chunk as { finishReason?: string | null }).finishReason ?? null;
        // A finish that is not itself another tool call means the model has
        // stopped talking for this turn — release the held tool row even if
        // the continuation produced no text of its own.
        if (finishReason !== 'tool_calls' && finishReason !== null) endToolPhase();
        /*
         * One round trip, counted where the round trip actually ends.
         *
         * Not on the tool-call chunk: `readToolName` answers for three
         * different chunks of the SAME call (the start, the input, and an
         * approval request), so counting there counted one call as two or
         * three and would have cut an ordinary turn off at four. A
         * `RUN_FINISHED` carrying `tool_calls` is exactly one continuation,
         * which is also the unit the server counts.
         */
        if (finishReason === 'tool_calls') {
          continuationsThisTurn += 1;
          for (const part of lastAssistantToolCalls(client.getMessages())) {
            if (circles.record(part.id, part.name, part.arguments)) circling = true;
          }
        }
        resume.markFinished();
      }

      const toolName = readToolName(chunk);
      if (toolName) {
        // Ordered ahead of the status: a trace update still in flight must
        // not land after it and leave the row describing the wrong phase.
        flushThinking.flush();
        inToolPhase = true;
        lastToolName = toolName;
        saidWhenToolCalled = saidSoFar;
        showToolStatus(statusForTool(toolName), toolName);
      }
      // The tool has returned but the model has not resumed — hold the row on
      // it through the continuation request rather than blanking it.
      if (chunk.type === 'TOOL_CALL_RESULT' && inToolPhase) {
        showToolStatus('Working through that…', lastToolName);
      }

      if (chunk.type === 'CUSTOM' && chunk.name === 'samwell-credits') {
        const value = chunk.value as { available?: unknown } | undefined;
        if (typeof value?.available === 'number') onCredits?.(value.available);
      }
    },
    onMessagesChange: (messages) => {
      if (resuming) return;
      // Before the text check: a step starts before he says a word about it.
      reportActivity(messages);
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
      sequence.update(replyParts(messages));
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
    reveal.cancel();
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
      await untilFinished(client.sendMessage(content));
    } catch (err) {
      // A turn the reader called off rejects here through the aborted request;
      // that is the outcome they asked for, not a failure to report.
      if (aborted) {
        reportThinkingDone();
        sequence.update(replyParts(client.getMessages()));
        await sequence.idle();
        return sequence.current().trim();
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
    let paused: TurnPause | null = null;
    for (;;) {
      if (aborted) break;
      if (streamError && !aborted && isWorthResuming(streamError) && resume.canResume()) {
        // The connection dropped, not the server refusing: go again from
        // where that request started, once the phone is back online.
        if (isCloudUnreachable(streamError)) reportCloudUnreached();
        const dropped = streamError;
        streamError = null;
        resuming = true;
        showToolStatus('Reconnecting…', lastToolName);
        if (await resume.resume(client, signal)) {
          lastProgressAt = Date.now();
          continue;
        }
        resuming = false;
        streamError = aborted ? null : dropped;
      }
      // Failed inside the stream: nothing more is coming. Below, what he had
      // already said is kept and the failure is said after it.
      if (streamError) break;
      if (finished) {
        /*
         * He has said goodbye and closed the conversation. Whatever he said
         * before that call is the whole of it; anything after would be a
         * second goodbye, which is exactly what this is here to prevent.
         * A card still up is answered no, as stop does.
         */
        useApprovalStore.getState().clearSession(sessionId);
        try {
          client.stop();
        } catch {
          // Already torn down, which is the outcome we wanted anyway.
        }
        break;
      }
      if (circling) {
        // He asked for something he had already been given, a third time.
        // Measured on real traffic, the worst turn went round 112 times;
        // nobody wanted the hundredth answer.
        console.warn('[Samwell Cloud] Turn repeated the same tool call; pausing it here.');
        paused = 'circling';
        break;
      }
      if (continuationsThisTurn >= TOOL_LOOP_CEILING) {
        // The backstop, for a run that never repeats itself exactly but never
        // ends either. Stopping a beat before the server's own refusal means
        // the reader gets the answer so far rather than an error.
        console.warn(
          `[Samwell Cloud] Turn reached ${TOOL_LOOP_CEILING} continuations; pausing it here.`,
        );
        paused = 'ceiling';
        break;
      }

      if (approvals.length > 0) lastProgressAt = Date.now();
      if (Date.now() - lastProgressAt > SETTLE_INACTIVITY_MS) {
        console.warn('[Samwell Cloud] Turn went quiet; returning partial content.');
        paused = 'quiet';
        break;
      }

      while (approvals.length > 0) {
        const approval = approvals.shift();
        if (!approval) continue;
        // Asked once what he said before it has finished arriving.
        await sequence.idle();
        // Stop may have landed while the words were arriving; its clear ran
        // before this card existed, so nothing would ever answer it.
        if (aborted) break;
        const approved = await useApprovalStore
          .getState()
          .requestApproval({ sessionId, toolName: approval.toolName, input: approval.input });
        await untilFinished(client.addToolApprovalResponse({ id: approval.id, approved }));
        if (finished) break;
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
        if (approved) showToolStatus(toolStatus(approval.toolName), approval.toolName);
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
          // Committed only once it has all been shown, so the hand-over from
          // the streaming bubble does not jump.
          sequence.update(replyParts(client.getMessages()));
          await sequence.idle();
          return sequence.current().trim();
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    reportThinkingDone();
    // Whatever streamed, and nothing else in the transcript: a canned "he got
    // stuck" bubble reads worse than the reply as far as it got. What is said
    // about a turn that stopped early is said in a toast (`onPaused`), with a
    // way to carry on, because silence on a long job looks like a crash.
    // The goodbye, when he ended onboarding, is the last of what he said.
    // The goodbye arrives in a tool call rather than as text, so it is
    // revealed here like any other reply, after the rest.
    const said = replyParts(client.getMessages());
    sequence.update(farewell ? [...said, farewell] : said);
    // Paced like any reply, and quick once stopped: stop cancels the reveal.
    await sequence.idle();
    const partial = sequence.current().trim();
    // Stop ends the request too, and stopping is not a failure.
    if (streamError && !aborted) {
      // Said after any words he got out: those are kept as his reply rather
      // than thrown away, so this cannot be a throw like the others.
      sayCloudTurnFailed(
        new Error(`Inside the stream: ${streamError.message} (POST ${endpointFor(mode, baseUrl, metered)})`),
      );
    } else if (paused && !aborted) {
      onPaused?.(paused);
    } else if (!partial) {
      console.warn(
        `[Samwell Cloud] Turn produced no answer (finishReason=${finishReason ?? 'none'}, aborted=${aborted}).`,
      );
    }
    return partial;
  } finally {
    turnOver = true;
    signal?.removeEventListener('abort', onAbort);
    flushThinking.cancel();
    reveal.cancel();
    // What he finished saying is kept, and before the caller hears how the
    // turn ended: a part must not land under an error set a moment earlier.
    // Unpaced now the reveal is cancelled, so this is a few microtasks.
    await sequence.idle();
    client.dispose();
  }
}

/** The tool calls in his latest message, for `tool-circling.ts` to count. */
function lastAssistantToolCalls(messages: UIMessage[]): { id: string; name: string; arguments: string }[] {
  const message = messages.findLast((candidate) => candidate.role === 'assistant');
  if (!message) return [];
  return message.parts.flatMap((part) => (part.type === 'tool-call' ? [part] : []));
}

function hasUnresolvedToolCalls(messages: UIMessage[]): boolean {
  return messages.some((message) => message.role === 'assistant' && hasPendingToolCall(message));
}
