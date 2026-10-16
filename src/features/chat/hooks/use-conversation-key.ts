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
 */
export function useConversationKey(sessionId: string | null): string {
  const [key, setKey] = React.useState(() => sessionId ?? 'new');
  const previous = React.useRef(sessionId);

  React.useEffect(() => {
    const before = previous.current;
    previous.current = sessionId;
    // The one transition that is not a change of conversation.
    if (before === null && sessionId !== null) return;
    setKey(sessionId ?? 'new');
  }, [sessionId]);

  return key;
}
