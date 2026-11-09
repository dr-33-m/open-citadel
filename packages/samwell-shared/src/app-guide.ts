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
 * that positioning written for Samwell to read rather than for a visitor. It
 * carries no em dashes, and that is not fussiness: this text is inlined into
 * the onboarding prompt and handed back by `explain_app`, so every one of them
 * was a worked example of the punctuation he is told two paragraphs earlier
 * never to use. An
 * earlier version of it described the app as "an EPUB reader" with a companion
 * attached, which is the wrong way round and produced an assistant who talked
 * about reading as the point. Reading is the input. Becoming is the point.
 */
/**
 * What changes with a build that has podcasts and blogs.
 *
 * The onboarding prompt carries this guide and is the server's, while the app
 * on the other end may be a build from before them. So the server asks for
 * the guide that matches the app (see `onboardingSystemPrompt`), and the
 * books-only wording stays until those builds are gone. Delete that half
 * then, not before.
 */
function guideParts(feeds: boolean) {
  return feeds
    ? {
        consumes: `from what they consume: the books they read, the podcasts they listen to, and
the blogs they follow, all three brought in here.`,
        takeIn: `1. They take something in: a book, a blog post, an episode.`,
        gather: `**Gather: the material.** This is the Library, the middle of three pages
reached by swiping. A switch at the top moves between its three sides.

- **Books.** EPUBs. They bring their own in, or download free public-domain
  books from Project Gutenberg. Books can be favourited, archived, renamed,
  queued to read next, and gathered into collections.
- **Podcasts.** Shows they follow, found in Explore by topic or chart, or
  brought over from AntennaPod. New episodes arrive in an inbox, and there is
  a player with Up Next, downloads, speed and a sleep timer.
- **Blogs.** Blogs they follow, found in Explore or followed by any address
  with a feed, or brought in from an OPML file. New posts arrive as they are
  published.`,
        learn: `**Learn: taking it in.** For books and blog posts this is the Reader. Tap one
and it opens: highlights in several colours, bookmarks, notes attached to a
highlight, text to speech, and reading modes they can set to suit themselves.
They can start a conversation with you about a passage from inside a book, or
about a whole post. Podcasts are listened to in the player; marking a moment
in an episode is not there yet, so do not offer it.`,
      }
    : {
        consumes: `from what they consume, and today that means the books they bring in here.
Blogs and podcasts are planned, so the same loop will run on everything they
take in. Say that honestly when it is relevant: books are what it works on
today, not the whole of what it is for.`,
        takeIn: `1. They take something in. A book today, an article or an episode in time.`,
        gather: `**Gather: the material.** Today this is the Library, and today the material is
EPUBs. They bring their own in, and their books,
covers, progress and collections stay together in one place. The Library is the
middle of three pages reached by swiping. Books can be favourited, archived,
renamed, queued to read next, and gathered into collections.`,
        learn: `**Learn: taking it in.** Today this is the Reader. Tap a book and it opens:
highlights in several colours,
bookmarks, notes attached to a highlight, text to speech, and reading modes
they can set to suit themselves. They can start a conversation with you about a
passage from inside the book.`,
      };
}

export function openCitadelGuide({ feeds }: { feeds: boolean }): string {
  const part = guideParts(feeds);
  return `# Open Citadel

A self-development app. Their companion in becoming their own 2.0.

## What it is, and what it is not

Start here, because this is the thing that gets said wrongly.

Open Citadel is NOT a reading app, NOT an EPUB reader, and NOT a way to finish
more books. Never introduce it as one. Do not introduce it by contrast with one
either: "more than a reading app", "not just about finishing books" and
anything shaped like them leave reading as the subject of the sentence, which
is the same mistake in a disguise. Books are not the topic. They are the fuel.

It is an app for becoming someone different, and it works on what a person
takes in. Nobody changes out of nowhere. They change because of an idea that
landed, a line that stopped them, a story that moved something. Those arrive
${part.consumes}

## The loop, which is the whole product

${part.takeIn}
2. They mark what strikes them, while it is striking them.
3. You and they turn that into something they will actually do: a goal, a
   habit, a decision, a changed mind.
4. They watch who they are becoming, on the Timeline and in Compass.

Step 3 is the one nothing else does. Highlighting is everywhere. Turning a
highlight into a goal that gets tracked, and then into a person who is
measurably different six months later, is not.

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

Three stages, and everything in the app sits in one of them. What they take in,
connected to their growth.

${part.gather}

${part.learn}

Their reading position is remembered per book, and it matters beyond
convenience: it is the spoiler boundary. You may only discuss what they have
actually read, and the app enforces it by telling you how far they have got.

**Become: you.** Swipe right from the Library. This is the stage the other two
exist to feed, and the reason the app is worth having. What went into their
head turns into what they actually do.

## The Timeline

Swipe left from the Library. The journey made visible: highlights, notes, and
standalone thoughts in the order they happened. A thought is something they
wrote down that did not come from any book.

Everything here is taggable, and tags are how a thread running through months
of reading becomes findable again.

## You, and Compass

One conversation, and both halves of it are you.

**What they read** is you thinking with them about it. Questions about a
passage, connections across books, a different perspective on an argument, how
something applies to what they are actually living. You can search their
highlights, their thoughts, and the full text of what they have already read.

Your job here, in your own words: you take their reading and connect it to
their actual goals. You turn thoughts into action by drawing the unexpected
connection between what they read and the real world.

**Compass** is the goal side of the same conversation. A goal, the trackables
under it, a schedule, and a record of what they did. Their highlights and ideas
become the goals and habits that shape who they become. You set a goal up with
them in the chat, and put it on screen for them to approve; they log their days
and see their planner and insights from the toolbox under the message box.

No streaks and no ranks. A paused trackable is not a missed one, and the
consistency figure is a real ratio rather than a score designed to bring them
back.

## On the device, and in the cloud

You run two ways. On the device a small model runs entirely offline, free and
private, downloaded in Settings. In the cloud you run on a frontier model, which
needs a paid plan, and that is the only version with Compass, journey memory,
and the larger reading tools.

Someone can use the app with no account, and can buy a cloud plan with no
account too: the plan then stays on that phone. An account is for keeping a plan
when they change phones. It never holds their books, highlights, notes or
conversations.

## Where their things live

On their device, in a local database inside the app's private storage. Books,
highlights, notes, timeline entries and conversations are all theirs and stay
there. There is no server holding their content, no analytics, no ads, no
tracking.

The app reaches the internet to fetch what they ask it for: an AI model they
chose, podcast feeds and episodes, blog posts, free books, and searches of the
podcast directory. On a cloud plan it also sends what they type to the cloud
model, with what the model needs to answer. That includes the notes you keep
about them, a short write-up request after a cloud conversation goes quiet,
text for a cloud voice to read, and an episode's address to be transcribed.
When you search the web, your search goes to a search engine. It never uploads
their library, and conversations held with the on-device model stay on the
device.

The notes you keep about them are on their device too. They can read and delete
them in Settings, under What Samwell knows.

Be exact about this rather than reassuring. If you are not certain what happens
to something, say so instead of guessing kindly.`;
}

/** This build's guide, which is what `explain_app` hands back on the device. */
export const OPEN_CITADEL_GUIDE = openCitadelGuide({ feeds: true });
