/**
 * Splits a raw model stream into what the reader sees and what Samwell was
 * thinking.
 *
 * Reasoning models wrap their scratch work in `<think>…</think>` and emit it
 * inline, in the same token channel as the answer. On-device there is no second
 * channel to read it from: the engine hands back one undifferentiated stream
 * and only reports `thinkingText` once generation has finished. So a model whose
 * reasoning was not separated leaked its whole thought process into the chat
 * bubble, tags and all.
 *
 * Parsing it here fixes that and buys something the app could not do before:
 * because the split happens as tokens arrive, "Samwell is thinking" is known
 * live rather than in hindsight, so the status orb can be honest during the
 * pause instead of after it.
 *
 * Deliberately not keyed to any model. The catalogue offers models nobody has
 * tested, so this must hold for one that was never predicted to reason at all.
 */

const OPEN = '<think>';
const CLOSE = '</think>';

/** The longest prefix of a marker that could still be completed by more input. */
const MAX_MARKER = Math.max(OPEN.length, CLOSE.length);

export interface ThinkSplit {
  /** Text to show in the message bubble. */
  visible: string;
  /** Reasoning gathered so far, for the trace panel. */
  thinking: string;
  /** Whether the stream is inside an unterminated `<think>` block right now. */
  isThinking: boolean;
}

export interface ThinkStream {
  /**
   * Absorb the stream as it stands and return the split.
   *
   * Takes the whole accumulated text rather than a delta, because that is what
   * the engine's token callback already provides, and re-parsing from the start
   * keeps a marker split across two callbacks from being missed.
   */
  push(accumulated: string): ThinkSplit;
}

/**
 * Whether `text` ends with something that might grow into `marker`.
 *
 * A marker can arrive across two callbacks ("<thi" then "nk>"), so a trailing
 * partial has to be held back rather than shown. Without this the reader sees
 * a bare "<thi" flicker into the bubble and disappear.
 */
function endsWithPartial(text: string, marker: string): boolean {
  const max = Math.min(marker.length - 1, text.length);
  for (let n = max; n > 0; n--) {
    if (text.endsWith(marker.slice(0, n))) return true;
  }
  return false;
}

/** Split one complete (or partial) stream into visible text and reasoning. */
export function splitThinking(text: string): ThinkSplit {
  let visible = '';
  let thinking = '';
  let rest = text;
  let inside = false;

  for (;;) {
    if (!inside) {
      const open = rest.indexOf(OPEN);
      if (open === -1) break;
      visible += rest.slice(0, open);
      rest = rest.slice(open + OPEN.length);
      inside = true;
      continue;
    }
    const close = rest.indexOf(CLOSE);
    if (close === -1) {
      thinking += rest;
      rest = '';
      break;
    }
    thinking += rest.slice(0, close);
    rest = rest.slice(close + CLOSE.length);
    inside = false;
  }

  if (!inside) visible += rest;

  // A trailing partial marker belongs to neither side yet.
  const tail = inside ? CLOSE : OPEN;
  const target = inside ? thinking : visible;
  if (endsWithPartial(target, tail)) {
    for (let n = Math.min(tail.length - 1, target.length); n > 0; n--) {
      if (target.endsWith(tail.slice(0, n))) {
        if (inside) thinking = thinking.slice(0, -n);
        else visible = visible.slice(0, -n);
        break;
      }
    }
  }

  return { visible, thinking, isThinking: inside };
}

/** A stateless splitter, shaped for a streaming call site. */
export function createThinkStream(): ThinkStream {
  return { push: (accumulated: string) => splitThinking(accumulated) };
}

/** Whether `text` carries reasoning markers at all. */
export function hasThinkMarkers(text: string): boolean {
  return text.includes(OPEN) || text.includes(CLOSE);
}

export const THINK_MARKER_MAX = MAX_MARKER;
