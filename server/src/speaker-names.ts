/**
 * Samwell works out who is talking.
 *
 * Scribe tells voices apart but not who they belong to: it answers
 * `speaker_0`, `speaker_1`. Samwell gets the episode and show titles, the show
 * notes and each speaker's first few lines, and answers with a name per
 * speaker, or none when the notes do not say. "Speaker 1" becomes "Lex
 * Fridman"; a guest the notes never name stays "Speaker 3".
 *
 * One structured call on the Maester default model, a few thousand tokens.
 * Its cost joins the job's settle. A failure here never fails the job: the
 * transcript is the thing paid for, and default names are still a transcript.
 */
import { defaultSpeakerName, type TranscriptDoc } from 'samwell-shared';
import { z } from 'zod';

const LINES_PER_SPEAKER = 4;
const CHARS_PER_SPEAKER = 600;
const NOTES_CHARS = 6_000;
const MAX_NAME_CHARS = 80;

export const SPEAKER_NAMES_PROMPT = `You name the speakers in a podcast transcript.

You get the show and episode titles, the show notes, and the first lines each
speaker says, labelled "Speaker 1", "Speaker 2" and so on. For each speaker,
answer with their name if the titles, the notes or their own lines make it
clear who they are: the host is usually named in the show's title or notes,
a guest in the episode title or notes, and people often say their own name or
greet each other by name early on.

Use the name as it is written in the notes. If you are not sure, answer null
for that speaker rather than guessing. Two labels can be the same person.
Never invent a name.`;

export const SpeakerNamesSchema = z.object({
  speakers: z.array(
    z.object({
      speaker: z.number().int(),
      name: z.string().nullable(),
    }),
  ),
});

export type SpeakerNamesAnswer = z.infer<typeof SpeakerNamesSchema>;

/** What Samwell is shown: the titles, the notes, and each speaker's opening lines. */
export function speakerNamesInput(
  doc: TranscriptDoc,
  context: { title: string; showTitle: string; notes?: string | null },
): string {
  const lines = doc.speakers.map((_, index) => {
    const said: string[] = [];
    let chars = 0;
    for (const segment of doc.segments) {
      if (segment.speaker !== index) continue;
      if (said.length >= LINES_PER_SPEAKER || chars >= CHARS_PER_SPEAKER) break;
      const text = segment.text.slice(0, CHARS_PER_SPEAKER - chars);
      said.push(text);
      chars += text.length;
    }
    return `${defaultSpeakerName(index)}:\n${said.map((line) => `- ${line}`).join('\n')}`;
  });
  return [
    `Show: ${context.showTitle}`,
    `Episode: ${context.title}`,
    `Show notes:\n${(context.notes ?? '').slice(0, NOTES_CHARS) || '(none)'}`,
    `Speakers:\n${lines.join('\n\n')}`,
  ].join('\n\n');
}

/**
 * Samwell's answer onto the transcript. A name for a speaker that does not
 * exist is ignored, a missing or empty one leaves the default, and a name is
 * trimmed to something a row label can hold.
 */
export function applySpeakerNames(doc: TranscriptDoc, answer: SpeakerNamesAnswer | null): TranscriptDoc {
  if (!answer) return doc;
  const speakers = [...doc.speakers];
  for (const { speaker, name } of answer.speakers) {
    const index = speaker - 1;
    if (index < 0 || index >= speakers.length) continue;
    const clean = name?.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_CHARS);
    if (clean) speakers[index] = clean;
  }
  return { ...doc, speakers };
}
