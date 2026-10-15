/**
 * What Samwell did in a turn, read from the turn's own messages.
 *
 * A cloud turn can do several things before it answers: look a book up,
 * search the web, read a chapter, queue a book. TanStack AI records each as a
 * `tool-call` part on the assistant message (its name, its arguments, its
 * state, and its output once there is one), the same whether the tool ran on
 * the device or on the server. This reads those parts into the two things the
 * reader is shown: the steps, in order, and the web pages any search found.
 *
 * Kept with the message once the turn is over (`chat_messages.activity`), so
 * scrolling back shows what he did and where the facts came from, not only
 * what he said.
 *
 * Pure: types only from the outside, so it is tested on its own.
 */
import type { WebSource } from 'samwell-shared';

export type StepStatus = 'running' | 'done' | 'failed' | 'declined';

export interface TurnStep {
  /** The tool call's id, so a step keeps its row as its state changes. */
  id: string;
  tool: string;
  /** "Searched the web for "Bernard Arnault"", in the tense its status calls for. */
  title: string;
  /** One line of what came of it, when there is something to say. */
  detail: string | null;
  status: StepStatus;
}

export interface TurnActivity {
  steps: TurnStep[];
  sources: WebSource[];
}

export const NO_ACTIVITY: TurnActivity = { steps: [], sources: [] };

/** The parts of a TanStack message this reads. Structural, so the client's own type fits. */
export interface ActivityPart {
  type: string;
  id?: string;
  name?: string;
  arguments?: string;
  state?: string;
  output?: unknown;
  approval?: { approved?: boolean };
}

export interface ActivityMessage {
  role: string;
  parts: readonly ActivityPart[];
}

/** How many sources are kept for a turn. Enough to check against; more is a list nobody opens. */
const MAX_SOURCES = 10;

function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    // Still streaming in: half a JSON object says nothing yet.
    return {};
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function quoted(value: unknown): string {
  const word = text(value);
  return word ? ` "${word.length > 60 ? `${word.slice(0, 57)}…` : word}"` : '';
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** [while running, once done], built from the call's arguments. */
function titles(tool: string, args: Record<string, unknown>): [string, string] {
  const q = quoted(args.query);
  const book = quoted(args.book_title) || ' this book';
  switch (tool) {
    case 'web_search':
      return [`Searching the web for${q}`, `Searched the web for${q}`];
    case 'search_library':
      return q ? [`Looking for${q} in your library`, `Looked for${q} in your library`] : ['Looking through your library', 'Looked through your library'];
    case 'get_book_details':
      return [`Looking up${book}`, `Looked up${book}`];
    case 'list_collections':
      return args.collection_name
        ? [`Opening the${quoted(args.collection_name)} collection`, `Opened the${quoted(args.collection_name)} collection`]
        : ['Looking over your collections', 'Looked over your collections'];
    case 'search_highlights':
      return [`Searching your highlights${q ? ` for${q}` : ''}`, `Searched your highlights${q ? ` for${q}` : ''}`];
    case 'search_thoughts':
      return [`Searching your thoughts${q ? ` for${q}` : ''}`, `Searched your thoughts${q ? ` for${q}` : ''}`];
    case 'search_reading':
      return [`Searching what you have read for${q}`, `Searched what you have read for${q}`];
    case 'list_chapters':
      return [`Opening the chapters of${book}`, `Opened the chapters of${book}`];
    case 'read_chapter':
      return [`Reading${quoted(args.chapter) || ' a chapter'}`, `Read${quoted(args.chapter) || ' a chapter'}`];
    case 'suggest_next_book':
      return ['Looking over your library', 'Looked over your library'];
    case 'search_journey':
      return ['Looking back over your journey', 'Looked back over your journey'];
    case 'explain_app':
      return ['Checking how the app works', 'Checked how the app works'];
    default:
      return [ACTION_TITLES[tool]?.[0] ?? 'Working on it', ACTION_TITLES[tool]?.[1] ?? 'Done'];
  }
}

/** The tools that change something, as [while running, once done]. */
const ACTION_TITLES: Record<string, [string, string]> = {
  add_to_queue: ['Adding to your queue', 'Added to your queue'],
  remove_from_queue: ['Taking out of your queue', 'Took out of your queue'],
  reorder_queue: ['Reordering your queue', 'Reordered your queue'],
  clear_queue: ['Clearing your queue', 'Cleared your queue'],
  start_reading: ['Moving to Currently Reading', 'Moved to Currently Reading'],
  remove_from_currently_reading: ['Taking off Currently Reading', 'Took off Currently Reading'],
  mark_as_finished: ['Marking as finished', 'Marked as finished'],
  toggle_favorite: ['Updating your favourites', 'Updated your favourites'],
  create_collection: ['Making a collection', 'Made a collection'],
  add_book_to_collection: ['Adding to a collection', 'Added to a collection'],
  remove_book_from_collection: ['Taking out of a collection', 'Took out of a collection'],
  delete_collection: ['Deleting a collection', 'Deleted a collection'],
  rename_book: ['Fixing a title', 'Fixed a title'],
  delete_book: ['Removing a book', 'Removed a book'],
  tag_highlight: ['Tagging a highlight', 'Tagged a highlight'],
  tag_thought: ['Tagging a thought', 'Tagged a thought'],
  delete_highlight: ['Deleting a highlight', 'Deleted a highlight'],
  delete_thought: ['Deleting a thought', 'Deleted a thought'],
  add_note_to_highlight: ['Writing a note', 'Wrote a note'],
  update_note: ['Rewriting a note', 'Rewrote a note'],
  delete_note: ['Deleting a note', 'Deleted a note'],
  update_thought: ['Rewriting a thought', 'Rewrote a thought'],
  suggest_highlight: ['Suggesting a highlight', 'Suggested a highlight'],
  suggest_thought: ['Suggesting a thought', 'Suggested a thought'],
};

/** Whether an output says the tool did not do its job. */
function failed(output: unknown): boolean {
  if (!output || typeof output !== 'object') return false;
  const record = output as { ok?: unknown; error?: unknown };
  return record.ok === false || (typeof record.error === 'string' && record.error.length > 0);
}

function count(output: unknown, key: string): number | null {
  const value = (output as Record<string, unknown> | null | undefined)?.[key];
  return Array.isArray(value) ? value.length : null;
}

/** One line of what came of a finished call. */
function detailFor(tool: string, output: unknown): string | null {
  const record = (output ?? {}) as Record<string, unknown>;
  switch (tool) {
    case 'web_search': {
      const sources = count(output, 'sources') ?? 0;
      return sources > 0 ? plural(sources, 'page') : 'Nothing useful came back';
    }
    case 'search_library': {
      const total = typeof record.total === 'number' ? record.total : null;
      return total === null ? null : total === 0 ? 'No match' : plural(total, 'book');
    }
    case 'list_collections': {
      const n = count(output, 'collections');
      return n === null ? null : plural(n, 'collection');
    }
    case 'search_highlights':
    case 'search_thoughts':
    case 'search_reading': {
      const n = count(output, 'results');
      return n === null ? null : n === 0 ? 'Nothing matched' : plural(n, 'match', 'matches');
    }
    case 'add_to_queue':
    case 'remove_from_queue':
    case 'reorder_queue':
    case 'start_reading':
    case 'remove_from_currently_reading':
    case 'mark_as_finished':
    case 'toggle_favorite':
    case 'delete_book':
    case 'add_book_to_collection':
    case 'remove_book_from_collection': {
      const done = Array.isArray(record.succeeded) ? (record.succeeded as unknown[]).filter((t): t is string => typeof t === 'string') : [];
      return done.length > 0 ? done.join(', ') : null;
    }
    default:
      return null;
  }
}

function statusOf(part: ActivityPart): StepStatus {
  if (part.approval?.approved === false) return 'declined';
  if (part.state === 'error') return 'failed';
  if (part.output === undefined) return 'running';
  return failed(part.output) ? 'failed' : 'done';
}

function sourcesOf(output: unknown): WebSource[] {
  const sources = (output as { sources?: unknown } | null | undefined)?.sources;
  if (!Array.isArray(sources)) return [];
  return sources.filter(
    (source): source is WebSource =>
      !!source && typeof source === 'object' && typeof (source as WebSource).url === 'string' && typeof (source as WebSource).title === 'string',
  );
}

/**
 * The steps and sources of the turn in progress: every tool call since the
 * reader last spoke, in the order made.
 */
export function turnActivity(messages: readonly ActivityMessage[]): TurnActivity {
  let start = messages.length;
  while (start > 0 && messages[start - 1]?.role !== 'user') start -= 1;

  const steps: TurnStep[] = [];
  const sources: WebSource[] = [];
  const seen = new Set<string>();
  for (const message of messages.slice(start)) {
    if (message.role !== 'assistant') continue;
    for (const part of message.parts) {
      if (part.type !== 'tool-call' || !part.name) continue;
      const status = statusOf(part);
      const [running, done] = titles(part.name, parseArgs(part.arguments));
      steps.push({
        id: part.id ?? `${part.name}-${steps.length}`,
        tool: part.name,
        title: status === 'running' ? running : done,
        detail:
          status === 'declined' ? 'You said no' : status === 'failed' ? 'Could not be done' : status === 'done' ? detailFor(part.name, part.output) : null,
        status,
      });
      if (part.name === 'web_search') {
        for (const source of sourcesOf(part.output)) {
          if (seen.has(source.url) || sources.length >= MAX_SOURCES) continue;
          seen.add(source.url);
          sources.push({ title: source.title, url: source.url, snippet: source.snippet ?? '' });
        }
      }
    }
  }
  return { steps, sources };
}

/** Whether two activities would draw the same, so an unchanged one is not set again. */
export function sameActivity(a: TurnActivity, b: TurnActivity): boolean {
  if (a.steps.length !== b.steps.length || a.sources.length !== b.sources.length) return false;
  return (
    a.steps.every((step, i) => {
      const other = b.steps[i];
      return other !== undefined && other.id === step.id && other.status === step.status && other.title === step.title && other.detail === step.detail;
    }) && a.sources.every((source, i) => source.url === b.sources[i]?.url)
  );
}

/**
 * A turn's activity as it stands once the turn is over: null when there is
 * nothing to show, and no step left running. A step still running when the
 * turn ended (the reader pressed stop, or the model called a tool it never
 * got an answer to) did not finish, and drawn as running it would shimmer
 * under a reply that is long done.
 */
export function settleActivity(activity: TurnActivity | null | undefined): TurnActivity | null {
  if (!activity || (activity.steps.length === 0 && activity.sources.length === 0)) return null;
  if (!activity.steps.some((step) => step.status === 'running')) return activity;
  return {
    steps: activity.steps.map((step) => (step.status === 'running' ? { ...step, status: 'failed' as const, detail: 'Stopped' } : step)),
    sources: activity.sources,
  };
}

/** For `chat_messages.activity`: null when there is nothing to keep. */
export function serializeActivity(activity: TurnActivity | null | undefined): string | null {
  const settled = settleActivity(activity);
  return settled ? JSON.stringify(settled) : null;
}

/** Back from `chat_messages.activity`. Anything unreadable is no activity rather than a crash. */
export function parseActivity(raw: string | null | undefined): TurnActivity | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TurnActivity>;
    const steps = Array.isArray(parsed.steps) ? parsed.steps.filter((s): s is TurnStep => !!s && typeof s.title === 'string') : [];
    const sources = Array.isArray(parsed.sources) ? parsed.sources.filter((s): s is WebSource => !!s && typeof s.url === 'string') : [];
    return steps.length > 0 || sources.length > 0 ? { steps, sources } : null;
  } catch {
    return null;
  }
}
