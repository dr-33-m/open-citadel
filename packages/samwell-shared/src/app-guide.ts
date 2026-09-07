/**
 * What Open Citadel is, written down once.
 *
 * Two readers, and that is the whole reason it is a file rather than a
 * paragraph inside a prompt. Onboarding introduces the app from it, and the
 * `explain_app` tool hands it to Samwell mid-chat when someone asks him what
 * something does. Two descriptions of the same app is how he ends up
 * confidently explaining a feature that works differently now.
 *
 * It is deliberately NOT part of any system prompt. A guide long enough to be
 * useful is long enough to be expensive, and most conversations never ask. As
 * a tool result it costs nothing until it is wanted.
 *
 * Written for Samwell to read, not for a reader to read: it says what each
 * surface is FOR, because "the Timeline lists your highlights" is something he
 * could have guessed and "the Timeline is where the journey becomes visible to
 * you" is not. Keep it that way when the fuller wiki replaces the contents.
 */
export const OPEN_CITADEL_GUIDE = `# Open Citadel

An EPUB reader built around one idea: that reading is only worth the hours if
something comes of it. So the app is a reader with a memory, and a companion
(you) who has read what they have read.

## The library

Their books live in a folder on their own device, and the app reads them in
place. Nothing is uploaded. On Android that folder is one they chose; on iOS it
is a folder the app owns, filled through the Files app or the share sheet.

The Library page is the middle of three pages you reach by swiping. It shows
what they are reading now, what is queued next, their collections, and
everything else they own. Books can be favourited, archived, renamed, and
gathered into collections.

## The reader

Tap a book and it opens. They can highlight a passage, attach a note to a
highlight, or start a conversation about the passage right there. Text to
speech will read to them from wherever they are on the page.

Their reading position is remembered per book, and it matters beyond
convenience: it is the spoiler boundary. You may only discuss what they have
actually read, and the app enforces that by telling you how far they have got.

## The Timeline

Swipe left from the Library. This is the journey made visible: highlights,
notes, and standalone thoughts in the order they happened. Thoughts are things
they wrote down that did not come from any book.

Everything here is taggable, and tags are how a thread through months of
reading becomes findable.

## Samwell, and Compass

Swipe right from the Library and you are there. Two modes, one place.

**Chat** is you as their reading companion: what a passage means, what to read
next, what one book is saying about a problem another one raised. You can
search their highlights, their thoughts, and the full text of what they have
already read.

**Compass** is you turned toward what they are actually working on. A goal, the
trackables under it, a schedule, and a record of what they did. No streaks and
no ranks: a paused trackable is not a missed one, and the consistency figure is
a real ratio rather than a score designed to make them come back.

## Samwell on the device, and Samwell in the cloud

He runs two ways. On the device a small model runs entirely offline, free and
private, downloaded in Settings. In the cloud, Grand Maester Samwell is a
frontier model, needs an account, and is the only one with Compass, journey
memory, and the larger reading tools.

The account is for reaching the cloud securely and keeping a subscription
active. It never holds their books, highlights, notes or conversations, which
stay on the device.

## What the app will not do

It does not gamify. It does not send notifications to drag them back. It does
not keep their reading on a server. And it does not do the reading, the
thinking, or the showing up for them.`;
