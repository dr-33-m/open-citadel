/**
 * Moments Samwell cites in an episode chat, "[12:04]" or "[1:02:10]", found
 * in his reply so each can be drawn as a gold time that plays the episode
 * from there. Pure.
 *
 * Only a clock in square brackets standing on its own counts: "[12:60]" is
 * not a time, "[12:04](…)" is already a link, "[[ref:…]]" is a card marker,
 * and a bare "12:04" in a sentence is left as words.
 */
export type EpisodeTime = { index: number; length: number; seconds: number; label: string };

const TIME = /(?<!\[)\[(\d{1,2}):([0-5]\d)(?::([0-5]\d))?\](?![(\]])/g;

export function parseEpisodeTimes(text: string): EpisodeTime[] {
  const found: EpisodeTime[] = [];
  for (const match of text.matchAll(TIME)) {
    const [whole, a, b, c] = match;
    const seconds = c != null ? Number(a) * 3600 + Number(b) * 60 + Number(c) : Number(a) * 60 + Number(b);
    found.push({ index: match.index ?? 0, length: whole.length, seconds, label: whole.slice(1, -1) });
  }
  return found;
}

/** The scheme a time's link is written in, caught by the reply's link handler. */
export const TIME_LINK = 'oc-time:';

/** The reply with each cited time written as a markdown link the reply can catch. */
export function linkEpisodeTimes(text: string): string {
  const times = parseEpisodeTimes(text);
  if (times.length === 0) return text;
  let out = '';
  let at = 0;
  for (const time of times) {
    out += `${text.slice(at, time.index)}[${time.label}](${TIME_LINK}${time.seconds})`;
    at = time.index + time.length;
  }
  return out + text.slice(at);
}

/** The seconds a time link points at, or null for any other link. */
export function timeFromLink(url: string): number | null {
  if (!url.startsWith(TIME_LINK)) return null;
  const seconds = Number(url.slice(TIME_LINK.length));
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}
