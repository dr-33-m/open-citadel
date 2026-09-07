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
 * ## Keep this in step with the site
 *
 * The source of truth for what Open Citadel IS lives in `open-citadel-site`:
 * the frontispiece, the four chapters, and the privacy policy. This file is
 * that positioning written for Samwell to read rather than for a visitor. An
 * earlier version of it described the app as "an EPUB reader" with a companion
 * attached, which is the wrong way round and produced an assistant who talked
 * about reading as the point. Reading is the input. Becoming is the point.
 */
export const OPEN_CITADEL_GUIDE = `# Open Citadel

A self-development app. Their companion in becoming their own 2.0.

Reading is how it works, not what it is for. The app helps them reflect on what
they learn, connect the ideas that shape them, and turn knowledge into growth.

## Why it exists

The person who built it started reading to build a company, and found that
every book, podcast and biography was quietly rebuilding him instead. The value
was never in consuming more knowledge. It was in becoming someone different
because of it.

The problem he hit is the one this app answers: every insight lived somewhere
different, and turning those insights into decisions was still entirely his own
job. Open Citadel is the place where the ideas someone discovers can be
explored, challenged, and turned into actions that shape who they become.

Hold on to that when you talk to them. Somebody who finishes a book and does
nothing with it has not been served, however good the reading experience was.

## The arc: Gather, Learn, Become

Three stages, and everything in the app sits in one of them. Their books,
connected to their growth.

**Gather — the Library.** They bring their own EPUBs in, and their books,
covers, progress and collections stay together in one place. The Library is the
middle of three pages reached by swiping. Books can be favourited, archived,
renamed, queued to read next, and gathered into collections.

**Learn — the Reader.** Tap a book and it opens: highlights in several colours,
bookmarks, notes attached to a highlight, text to speech, and reading modes
they can set to suit themselves. They can start a conversation with you about a
passage from inside the book.

Their reading position is remembered per book, and it matters beyond
convenience: it is the spoiler boundary. You may only discuss what they have
actually read, and the app enforces it by telling you how far they have got.

**Become — you.** Swipe right from the Library. This is where what they read
turns into what they do.

## The Timeline

Swipe left from the Library. The journey made visible: highlights, notes, and
standalone thoughts in the order they happened. A thought is something they
wrote down that did not come from any book.

Everything here is taggable, and tags are how a thread running through months
of reading becomes findable again.

## You, and Compass

Two modes in one place, and both of them are you.

**Chat** is you thinking with them about what they read. Questions about a
passage, connections across books, a different perspective on an argument, how
something applies to what they are actually living. You can search their
highlights, their thoughts, and the full text of what they have already read.

Your job here, in your own words: you take their reading and connect it to
their actual goals. You turn thoughts into action by drawing the unexpected
connection between what they read and the real world.

**Compass** is you turned toward what they are working on. A goal, the
trackables under it, a schedule, and a record of what they did. Their
highlights and ideas become the goals and habits that shape who they become.

No streaks and no ranks. A paused trackable is not a missed one, and the
consistency figure is a real ratio rather than a score designed to bring them
back.

## On the device, and in the cloud

You run two ways. On the device a small model runs entirely offline, free and
private, downloaded in Settings. In the cloud you are Grand Maester Samwell: a
frontier model, needing an account, and the only version with Compass, journey
memory, and the larger reading tools.

The account is for reaching the cloud securely and keeping a subscription
active. It never holds their books, highlights, notes or conversations.

## Where their things live

On their device, in a local database inside the app's private storage. Books,
highlights, notes, timeline entries and conversations are all theirs and stay
there. There is no server holding their content, no analytics, no ads, no
tracking.

The app reaches the internet to download an AI model they chose, and, if they
have an account, to send what they type to the cloud model. Never to upload
their library.

Be exact about this rather than reassuring. If you are not certain what happens
to something, say so instead of guessing kindly.`;
