/**
 * A conversation as plain text, one line per turn, labelled the way every
 * prompt that reads a transcript expects: `User:` and `Samwell:`.
 *
 * One definition, because chat titles and the journal both send transcripts
 * and would otherwise each decide the labels. System and tool rows are left
 * out; they are scaffolding, not something anyone said.
 */
export function formatTranscript(messages: { role: string; content: string }[]): string {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => `${m.role === 'user' ? 'User' : 'Samwell'}: ${m.content}`)
    .join('\n');
}
