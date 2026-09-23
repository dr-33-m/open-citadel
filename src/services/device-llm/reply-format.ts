/**
 * How a model family marks its reasoning, and what to do with it.
 *
 * The app reads reasoning in one shape, `<think>…</think>` (see
 * `utils/think-stream`), which Qwen 3 writes natively. Gemma 4 writes its
 * thought channel instead, `<|channel>thought\n…<channel|>`, and does so even
 * with thinking off, now and then (Google's Gemma 4 prompt-formatting guide).
 * This module turns a family's markers into the app's one shape, and removes
 * reasoning from a finished reply before it goes back into the history, which
 * both Google and Qwen require: a model is not meant to read its own past
 * thoughts, and on a 2048-token window they are room the conversation needs.
 */

export interface ReasoningMarkers {
  open: string;
  close: string;
  /** A word the family writes straight after `open`, naming the channel. */
  label?: string;
}

export const THINK_MARKERS: ReasoningMarkers = { open: '<think>', close: '</think>' };

export const GEMMA_THOUGHT_MARKERS: ReasoningMarkers = {
  open: '<|channel>',
  close: '<channel|>',
  label: 'thought',
};

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `text` with a family's reasoning markers rewritten as `<think>…</think>`. */
export function asThinkMarkers(text: string, markers: ReasoningMarkers): string {
  if (markers.open === THINK_MARKERS.open && markers.close === THINK_MARKERS.close) return text;
  const open = new RegExp(`${escape(markers.open)}${markers.label ? `(?:${escape(markers.label)}\\n?)?` : ''}`, 'g');
  return text
    .replace(open, THINK_MARKERS.open)
    .replaceAll(markers.close, THINK_MARKERS.close);
}

/**
 * A finished reply without its reasoning: every closed block, and a block cut
 * off before it closed, which is reasoning the model never finished.
 */
export function withoutReasoning(text: string, markers: ReasoningMarkers): string {
  const normalized = asThinkMarkers(text, markers);
  const closed = normalized.replace(/<think>[\s\S]*?<\/think>/g, '');
  const cut = closed.indexOf(THINK_MARKERS.open);
  return (cut === -1 ? closed : closed.slice(0, cut)).trim();
}
