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
  search_highlights: 'searching',
  search_thoughts: 'searching',
  search_reading: 'searching',
  list_chapters: 'searching',
  read_chapter: 'searching',
  list_collections: 'searching',

  // Weighing options rather than fetching a row.
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
