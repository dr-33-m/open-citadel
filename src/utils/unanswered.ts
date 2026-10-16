/**
 * Which of the reader's messages never got a reply: the send failed, the
 * reply came back empty, or the turn was stopped before a word arrived. Those
 * are the ones worth sending again.
 *
 * A message is answered when the next turn after it is one of Samwell's.
 * System and tool rows are not turns anybody had, so they are looked past.
 * The last message, while its turn is still running, is not unanswered: it is
 * being answered.
 */
export function unansweredMessageIds(
  messages: readonly { id: string; role: string }[],
  turnInFlight: boolean,
): ReadonlySet<string> {
  const turns = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  const unanswered = new Set<string>();
  turns.forEach((message, index) => {
    if (message.role !== 'user') return;
    const next = turns[index + 1];
    if (next?.role === 'assistant') return;
    if (!next && turnInFlight) return;
    unanswered.add(message.id);
  });
  return unanswered;
}
