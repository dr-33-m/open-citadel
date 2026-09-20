import { z } from 'zod';

/**
 * Samwell's journal: what he writes down about someone after a conversation.
 *
 * The other journey notes are deterministic (a book finished, a goal ended).
 * These are the ones that make him feel like he knows the person: what they
 * are working through, what matters to them, what they decided. One call per
 * conversation that has gone quiet, and the notes it returns are stored on the
 * device, where `search_journey` finds them in any later chat.
 *
 * Only a transcript that already went to the cloud is ever sent here. The
 * device decides that per message (see `chat_messages.via`), so a
 * conversation held with the on-device model never leaves the phone for this.
 */

/** The most notes one conversation may produce. Most produce none or one. */
export const MAX_JOURNAL_NOTES = 3;
/** The longest note kept. Long enough for one specific thought, short enough
 *  that five of them still fit in one `search_journey` answer. */
const MAX_JOURNAL_NOTE = 280;
const MAX_JOURNAL_TAGS = 4;

export const JournalRequestSchema = z.object({
  /** Which surface the conversation was on. Changes what is worth noticing. */
  surface: z.enum(['reading', 'compass', 'onboarding']),
  /** The book a reading chat was about, when there was one. */
  bookTitle: z.string().max(300).nullable(),
  /** The part of the conversation already written up, for context only. */
  earlier: z.string().max(4000),
  /** The part to write up: everything said since the last time. */
  conversation: z.string().min(1).max(16000),
  /** Recent notes already kept, so the same thing is not written twice. */
  existingNotes: z.array(z.string().max(1000)).max(12),
  modelId: z.string().optional(),
});
export type JournalRequest = z.infer<typeof JournalRequestSchema>;

const JournalNoteSchema = z.object({
  text: z.string().min(1).max(MAX_JOURNAL_NOTE),
  tags: z.array(z.string().min(1).max(40)).max(MAX_JOURNAL_TAGS),
});
export type JournalNote = z.infer<typeof JournalNoteSchema>;

/** The contract the device relies on. An empty list is a normal answer. */
export const JournalResponseSchema = z.object({
  notes: z.array(JournalNoteSchema).max(MAX_JOURNAL_NOTES),
});
export type JournalResponse = z.infer<typeof JournalResponseSchema>;

/**
 * What the MODEL is held to, deliberately looser than the response above, for
 * the reason `GoalTakeawayModelSchema` gives: failing a good answer over a few
 * characters retries and 502s. `normalizeJournalNotes` trims to the contract.
 */
export const JournalModelSchema = z.object({
  notes: z
    .array(
      z.object({
        text: z.string(),
        tags: z.array(z.string()).nullable(),
      }),
    )
    .max(10),
});
export type JournalModel = z.infer<typeof JournalModelSchema>;

export const JOURNAL_PROMPT = `Task: you are Samwell, a self-development companion, keeping a private journal about the person you talk with. The user message is JSON: { surface, bookTitle, earlier, conversation, existingNotes }. "conversation" is what was just said; "earlier" is what came before it and is already written up. Write down what is worth remembering about this person from "conversation".

What is worth a note: something that will still matter in a month. What they are working toward or struggling with, what they value, a decision they made and why, a pattern in how they work, their circumstances (job, family, schedule, health) when they bring them up themselves, what a book meant to them rather than what it said, and how they like to be spoken to.

What is not: the content of the book or the topic for its own sake, one-off requests ("asked for a summary"), small talk, anything you said or suggested, and anything already in existingNotes. Never record passwords, account numbers, addresses, phone numbers, or private details about other people beyond what is needed to understand the user.

Most conversations produce nothing new. Returning { "notes": [] } is the right answer then, and much better than a vague note. Return at most 3.

Each note:
- One or two plain sentences, under 250 characters, about them in the third person ("They", never "the user"). Specific, not general: "Wants to run a half marathon in March but keeps skipping Monday runs after late shifts", not "Is interested in running".
- Their meaning, in your words. Never quote them or present a note as something they said.
- Up to 3 short lowercase tags, single words where possible, that someone would search for later.
- Plain, simple English. No em dashes.`;

/**
 * Trims the model's notes to the contract: cleaned, capped, de-duplicated,
 * with empty ones dropped. Never throws; nothing surviving is an empty list.
 */
export function normalizeJournalNotes(model: JournalModel): JournalNote[] {
  const seen = new Set<string>();
  const notes: JournalNote[] = [];
  for (const raw of model.notes) {
    const text = clipAtSentence(
      raw.text
        .trim()
        .replace(/^["'“”]+|["'“”]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    );
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);

    const tags = [
      ...new Set(
        (raw.tags ?? [])
          .map((tag) => tag.trim().toLowerCase().replace(/^#/, '').slice(0, 40))
          .filter(Boolean),
      ),
    ].slice(0, MAX_JOURNAL_TAGS);

    notes.push({ text, tags });
    if (notes.length === MAX_JOURNAL_NOTES) break;
  }
  return notes;
}

/** Cut at the last sentence that fits rather than mid-word. */
function clipAtSentence(text: string): string {
  if (text.length <= MAX_JOURNAL_NOTE) return text;
  const clipped = text.slice(0, MAX_JOURNAL_NOTE);
  const lastStop = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('! '));
  if (lastStop > 60) return clipped.slice(0, lastStop + 1);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, lastSpace > 60 ? lastSpace : MAX_JOURNAL_NOTE - 1)}…`;
}
