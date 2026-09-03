/**
 * What Samwell is doing right now, as one value.
 *
 * The chat surfaces used to each answer this inline, and they drifted: the
 * hub page and the per-session screen both hardcoded a magnifier for *every*
 * tool, so tagging a highlight and deleting a thought and reordering a queue
 * all claimed to be searching. The orb makes that worse rather than better —
 * its whole premise is that the shape in motion tells the reader what kind of
 * work is in flight, so a `searching` orb over a delete is an outright lie.
 *
 * So the mapping lives here, once, as a pure function of store state. Both
 * surfaces render whatever it returns and neither one decides anything.
 */
import type { ThinkingOrbState } from '@/components/ui/thinking-orb';

export interface AgentActivity {
  /** Which orb animation to run. */
  orb: ThinkingOrbState;
  /** The shimmering line beside it. */
  label: string;
}

/**
 * Which kind of work each tool is, keyed by the same names the executor uses.
 *
 * Deliberately not a prefix rule. `suggest_next_book` reasons over the whole
 * library while `suggest_highlight` writes one line down, and they share a
 * prefix — grouping by spelling would put the wrong shape on both.
 */
const TOOL_ORB: Record<string, ThinkingOrbState> = {
  // Reading something back.
  get_compass_status: 'searching',
  get_today: 'searching',
  get_trackable_history: 'searching',
  search_highlights: 'searching',
  search_journey: 'searching',
  search_thoughts: 'searching',
  search_reading: 'searching',
  list_chapters: 'searching',
  read_chapter: 'searching',
  list_collections: 'searching',

  // Weighing options rather than fetching a row.
  propose_goal: 'solving',
  propose_adjustments: 'solving',
  suggest_next_book: 'solving',

  // Writing something down.
  suggest_highlight: 'composing',
  suggest_thought: 'composing',

  // Giving things a structure.
  tag_highlight: 'shaping',
  tag_thought: 'shaping',
  create_collection: 'shaping',
  add_book_to_collection: 'shaping',
  remove_book_from_collection: 'shaping',
  reorder_queue: 'shaping',

  // Plain state changes.
  log_trackable: 'working',
  add_to_queue: 'working',
  remove_from_queue: 'working',
  toggle_favorite: 'working',
  mark_as_finished: 'working',
  remove_from_currently_reading: 'working',

  // A destructive call parks until the reader approves it. That is not work
  // in flight, it is waiting on a person, and `listening` is the one state
  // that says so.
  delete_highlight: 'listening',
  delete_thought: 'listening',
};

/** The slice of chat state that decides what the indicator shows. */
export interface AgentActivityInput {
  isGenerating: boolean;
  isToolCalling: boolean;
  /** The tool actually running, for picking a truthful orb. */
  toolCallName: string | null;
  /** The sentence the tool table supplies. */
  toolCallStatus: string | null;
  isThinking: boolean;
  /** Whether the first token has landed — once it has, the bubble speaks. */
  isStreaming: boolean;
}

/**
 * What to show between the user sending and the store knowing about it.
 *
 * A brand-new session primes the engine with its system prompt before
 * `sendMessage` reaches the store, and on a slow device that is a real wait
 * with nothing in the transcript to hang a status on. This fills that gap.
 *
 * Deliberately identical to what `agentActivity` returns for a plain wait, so
 * the handover from this to the real value changes nothing on screen. It used
 * to be a spinner, which meant the first message of every new chat showed a
 * spinner that then became an orb a second later — two different answers to
 * the same question, and the seam was visible every time.
 */
export const PENDING_ACTIVITY: AgentActivity = { orb: 'working', label: 'Processing…' };

/**
 * `null` means show nothing: either nothing is running, or tokens are already
 * arriving and the reply bubble is itself the progress indicator. Two things
 * claiming to be the live status at once is how the old screen ended up with
 * a pill hanging under a half-written answer.
 */
export function agentActivity({
  isGenerating,
  isToolCalling,
  toolCallName,
  toolCallStatus,
  isThinking,
  isStreaming,
}: AgentActivityInput): AgentActivity | null {
  if (!isGenerating) return null;

  if (isToolCalling) {
    return {
      orb: (toolCallName && TOOL_ORB[toolCallName]) || 'working',
      label: toolCallStatus ?? 'Working on it…',
    };
  }

  // Tokens are flowing; the bubble is the status.
  if (isStreaming) return null;

  // Waiting on the first token. A model with thinking turned on is reasoning,
  // which is a different shape from one simply generating.
  return isThinking
    ? { orb: 'solving', label: 'Thinking…' }
    : { orb: 'working', label: 'Processing…' };
}

/**
 * The single live row a transcript's footer should render for the turn in
 * flight — never two stacked.
 *
 * `activity` is the plain orb-and-label row: the wait before the first token,
 * or a tool running on a model that does not reason. `trace` is the reasoning
 * panel, and once thinking has started it is the *only* row for the rest of
 * the turn — a tool call in the middle folds its own orb and label into that
 * same panel's trigger (`toolActivity`) rather than spawning a second row.
 * The panel then stays mounted through the whole turn, so a tool call never
 * resets its "thought for how long" clock.
 *
 * Both surfaces render whatever this returns through `TurnStatus` and neither
 * one decides anything.
 */
export type TurnIndicator =
  | { kind: 'activity'; activity: AgentActivity }
  | {
      kind: 'trace';
      trace: string;
      /** Whether tokens are still landing in the trace: false while a tool
       *  runs, and once the answer starts. */
      active: boolean;
      /** Measured thinking time in seconds, when the caller has it. */
      seconds: number | undefined;
      /** Set while a tool runs mid-reasoning: the panel's trigger shows this
       *  tool's orb and label in place of "Thinking…" / "Thought for X". */
      toolActivity: AgentActivity | null;
    };

export function turnIndicator(
  input: AgentActivityInput & {
    /** The reasoning trace so far. */
    trace: string;
    /** Measured thinking time in seconds, when the caller has it. */
    traceSeconds?: number;
  },
): TurnIndicator | null {
  const { trace, traceSeconds, ...activityInput } = input;

  if (!activityInput.isGenerating && !trace) return null;

  // Once there is a trace, the reasoning panel owns the footer for the rest of
  // the turn — a tool call folds into its trigger instead of stacking a row.
  if (trace) {
    return {
      kind: 'trace',
      trace,
      active:
        activityInput.isGenerating &&
        activityInput.isThinking &&
        !activityInput.isToolCalling,
      seconds: traceSeconds,
      toolActivity:
        activityInput.isGenerating && activityInput.isToolCalling
          ? agentActivity(activityInput)
          : null,
    };
  }

  // No trace: the plain status row. This is the whole story for a model that
  // does not reason — the wait, and any tool it calls — and it must keep
  // showing nicely there. `agentActivity` returns null once tokens are
  // flowing (the bubble is the status) or the turn is over.
  const activity = activityInput.isGenerating ? agentActivity(activityInput) : null;
  return activity ? { kind: 'activity', activity } : null;
}
