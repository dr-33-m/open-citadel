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

/**
 * What a note is, so a win can be found as a win and a commitment followed up.
 * Stored on the device beside the kinds it writes itself (`journey_notes.kind`).
 */
export const JOURNAL_NOTE_KINDS = ['win', 'struggle', 'commitment', 'milestone', 'about', 'recommended'] as const;
export type JournalNoteKind = (typeof JOURNAL_NOTE_KINDS)[number];

/** The most notes one conversation may produce. Most produce none or one. */
export const MAX_JOURNAL_NOTES = 3;
/** About 200 words: small enough to send on every cloud turn. */
export const MAX_JOURNAL_PROFILE = 1400;
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
  /** His current picture of them, to be rewritten. Absent from an older build. */
  profile: z.string().max(MAX_JOURNAL_PROFILE * 2).nullable().optional(),
  /** What they said they would do and have not closed. Absent from an older build. */
  openCommitments: z
    .array(z.object({ id: z.string().max(80), text: z.string().max(1000) }))
    .max(12)
    .optional(),
  /** Their local date, so "by Friday" can become a date. */
  today: z.string().max(10).optional(),
  modelId: z.string().optional(),
});
export type JournalRequest = z.infer<typeof JournalRequestSchema>;

const JournalNoteSchema = z.object({
  text: z.string().min(1).max(MAX_JOURNAL_NOTE),
  tags: z.array(z.string().min(1).max(40)).max(MAX_JOURNAL_TAGS),
  kind: z.enum(JOURNAL_NOTE_KINDS).optional(),
  /** A commitment's date, when they gave one. */
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
export type JournalNote = z.infer<typeof JournalNoteSchema>;

/** The contract the device relies on. An empty list is a normal answer. */
export const JournalResponseSchema = z.object({
  notes: z.array(JournalNoteSchema).max(MAX_JOURNAL_NOTES),
  /** His rewritten picture of them, or null to keep the one he has. */
  profile: z.string().max(MAX_JOURNAL_PROFILE).nullable().optional(),
  /** Ids from `openCommitments` this conversation closed. */
  resolved: z.array(z.string()).optional(),
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
        kind: z.string().nullable(),
        due_on: z.string().nullable(),
      }),
    )
    .max(10),
  profile: z.string().nullable(),
  resolved_commitments: z.array(z.string()).nullable(),
});
export type JournalModel = z.infer<typeof JournalModelSchema>;

export const JOURNAL_PROMPT = `Task: you are Samwell, a self-development companion, keeping a private journal about the person you talk with. The user message is JSON: { surface, bookTitle, earlier, conversation, existingNotes, profile, openCommitments, today }. "conversation" is what was just said; "earlier" is what came before it and is already written up. Write down what is worth remembering about this person from "conversation", so that you can show them later that you were paying attention.

A note is worth keeping if it will still matter in a month. Give each one a "kind":
- win: something they did or got through, with what made it hard.
- struggle: what they are up against, including one that has eased.
- commitment: what they said they would do. Set "due_on" (YYYY-MM-DD, worked out from "today") only if they gave a time.
- milestone: a turning point, or a decision they made and why.
- about: their circumstances when they bring them up themselves, what they value, what a book meant to them, how they like to be spoken to.
- recommended: something you pointed them to, and whether they took it up.

What is not worth a note: the content of the book or the topic for its own sake, one-off requests ("asked for a summary"), small talk, advice of yours they did not take up, and anything already in existingNotes. Never record passwords, account numbers, addresses, phone numbers, or private details about other people beyond what is needed to understand them.

Most conversations produce nothing new. Returning an empty "notes" list is the right answer then, and much better than a vague note. Return at most 3.

Each note:
- One or two plain sentences, under 250 characters, about them in the third person ("They", never "the user"). Specific, not general: "Wants to run a half marathon in March but keeps skipping Monday runs after late shifts", not "Is interested in running".
- Their meaning, in your words. Never quote them or present a note as something they said.
- Up to 3 short lowercase tags, single words where possible, that someone would search for later.
- Plain, simple English. No em dashes.

"resolved_commitments": the id of each item in openCommitments that this conversation shows they did, dropped or replaced. Null if none.

"profile": null if you already have one and nothing changed. If "profile" is empty and you know anything of them from existingNotes or the conversation, write one now. Otherwise your whole updated picture of them, under 200 words, starting from "profile". It replaces the old one, so keep what still holds and drop what no longer does: what they are working toward, where they are with it, what they value, what they tend to struggle with, how they like to be spoken to. Mark anything you are unsure of as a guess. Leave out anything painful they would not want read back. Plain, simple English. No em dashes.`;

/**
 * Trims the model's notes to the contract: cleaned, capped, de-duplicated,
 * with empty ones dropped. Never throws; nothing surviving is an empty list.
 */
export function normalizeJournalNotes(model: Pick<JournalModel, 'notes'>): JournalNote[] {
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

    const kind = JOURNAL_NOTE_KINDS.find((known) => known === raw.kind?.trim().toLowerCase());
    const dueOn = kind === 'commitment' && /^\d{4}-\d{2}-\d{2}$/.test(raw.due_on?.trim() ?? '') ? raw.due_on!.trim() : null;
    notes.push({ text, tags, kind: kind ?? 'about', dueOn });
    if (notes.length === MAX_JOURNAL_NOTES) break;
  }
  return notes;
}

/**
 * The profile without the field name the model sometimes writes in front of
 * it ("profile: They are building..."), which the reader then saw at the top
 * of his picture of them. Shared so the app can clean one already stored.
 */
export function cleanProfileText(text: string): string {
  return text.replace(/^\s*(?:\*\*)?profile(?:\*\*)?\s*:\s*/i, '').trim();
}

/**
 * The whole write-up, trimmed to the contract. Only ids it was given can be
 * resolved, and an empty or unchanged profile comes back null so the one he
 * has is kept.
 */
export function normalizeJournalWriteUp(model: JournalModel, openIds: readonly string[]): JournalResponse {
  const profile = clipAtSentence(cleanProfileText(model.profile ?? '').replace(/[ \t]+/g, ' '), MAX_JOURNAL_PROFILE);
  return {
    notes: normalizeJournalNotes(model),
    profile: profile || null,
    resolved: [...new Set(model.resolved_commitments ?? [])].filter((id) => openIds.includes(id)),
  };
}

/** Cut at the last sentence that fits rather than mid-word. */
function clipAtSentence(text: string, max = MAX_JOURNAL_NOTE): string {
  if (text.length <= max) return text;
  const clipped = text.slice(0, max);
  const lastStop = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('! '));
  if (lastStop > 60) return clipped.slice(0, lastStop + 1);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, lastSpace > 60 ? lastSpace : max - 1)}…`;
}
