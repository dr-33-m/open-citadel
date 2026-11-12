import React from 'react';

/**
 * A key that changes when the conversation changes, and not when it merely
 * gains an id.
 *
 * The scroller is keyed so that opening a different conversation starts at the
 * bottom of that one rather than wherever the last was left. But a brand-new
 * chat has no id until its first message is sent, so keying on the session id
 * directly meant the id arriving mid-send counted as a change: the scroller
 * unmounted and remounted around the message the reader had just sent, drawing
 * it a second time with its entrance animation replayed, while the header
 * changed underneath. The same conversation being saved is not a different
 * conversation.
 *
 * Worked out during render, not in an effect. Set from an effect, the key
 * moved a commit late: the newly opened chat was drawn in full inside the
 * previous chat's scroller, at the previous chat's offset, and then drawn in
 * full again when the key caught up and the scroller remounted. Twice the work
 * on every switch, and the first copy visibly jumped. setState during render
 * for a prop change is React's sanctioned reset: it re-renders before
 * anything commits, so the old scroller never sees the new conversation.
 */
export function useConversationKey(sessionId: string | null): string {
  const [state, setState] = React.useState(() => ({ key: sessionId ?? 'new', for: sessionId }));
  if (sessionId === state.for) return state.key;

  // The one transition that is not a change of conversation.
  const key = state.for === null && sessionId !== null ? state.key : (sessionId ?? 'new');
  setState({ key, for: sessionId });
  return key;
}
