/**
 * Finding shows: Apple's charts for browsing and Apple's directory for search.
 *
 * The same public endpoints AntennaPod's "Suggested by Apple Podcasts" and its
 * Apple search use (`ItunesTopListLoader`, `ItunesPodcastSearcher`). Neither
 * needs a key. A chart entry carries an Apple id rather than a feed address,
 * so opening one looks the feed up first (`resolveFeedUrl`).
 *
 * Where AntennaPod shows one chart, Explore here shows a shelf per genre, led
 * by the genres a reader of this app is most likely to want: books, ideas,
 * history, self-improvement.
 */
import { createRequestGate } from "@/utils/request-gate";

/**
 * A show as a tile draws it, and no more. Apple's charts send a summary with
 * every entry, and nothing here shows one (a show's page reads its own from
 * the feed): carried along, they were two thirds of every chart held in
 * memory and of the copy kept across launches (`lib/query-persist`).
 */
export type DiscoveredShow = {
  /** Apple's id, when the show came from Apple. */
  appleId: string | null;
  title: string;
  author: string | null;
  artworkUrl: string | null;
  /** Known for search results; looked up on open for chart entries. */
  feedUrl: string | null;
};

export type ExploreGenre = { id: number | null; label: string };

/** In the order Explore draws them. `null` is the overall chart. */
export const EXPLORE_GENRES: ExploreGenre[] = [
  { id: null, label: "Top shows" },
  { id: 1482, label: "Books" },
  { id: 1500, label: "Self-improvement" },
  { id: 1487, label: "History" },
  { id: 1443, label: "Philosophy" },
  { id: 1533, label: "Science" },
  { id: 1321, label: "Business" },
  { id: 1324, label: "Society & culture" },
  { id: 1512, label: "Health & fitness" },
  { id: 1318, label: "Technology" },
  { id: 1314, label: "Religion & spirituality" },
  { id: 1489, label: "News" },
];

const TIMEOUT_MS = 15_000;

/** The listener's country for the charts, from the device locale. */
function countryCode(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? "";
    const region = locale.split(/[-_]/).find((part, i) => i > 0 && /^[A-Za-z]{2}$/.test(part));
    return (region ?? "us").toLowerCase();
  } catch {
    return "us";
  }
}

/** Chart requests in flight at once, so twelve charts on a slow connection arrive top first. */
const turn = createRequestGate(3);

/** One request to Apple's directory, with a timeout and the caller's cancellation if it has one. */
async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  // Already cancelled (while it waited its turn): the listener would never hear it.
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`The directory answered ${response.status}.`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * `getJson` for a chart, which waits its turn at the gate.
 *
 * Only the charts queue. A search, and the lookup behind a show somebody just
 * tapped, are one request each and somebody is watching for the answer, so
 * they go at once. They used to share the gate, and on a slow connection a
 * tapped show sat behind every chart still loading, each allowed fifteen
 * seconds: its page turned its spinner for minutes before it had asked for
 * anything.
 */
async function getChartJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const done = await turn();
  try {
    return await getJson(url, signal);
  } finally {
    done();
  }
}

/** Apple's artwork URLs carry their size; ask for one sharp enough for a hero. */
export function largeArtwork(url: string | null | undefined, size = 600): string | null {
  if (!url) return null;
  return url.replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)$/i, `/${size}x${size}bb.$2`);
}

type Label = { label?: string };
type ChartEntry = {
  "im:name"?: Label;
  "im:artist"?: Label;
  "im:image"?: (Label & { attributes?: { height?: string } })[];
  id?: { attributes?: { "im:id"?: string } };
};

function fromChartEntry(entry: ChartEntry): DiscoveredShow | null {
  const title = entry["im:name"]?.label;
  const appleId = entry.id?.attributes?.["im:id"];
  if (!title || !appleId) return null;
  const images = entry["im:image"] ?? [];
  return {
    appleId,
    title,
    author: entry["im:artist"]?.label ?? null,
    artworkUrl: largeArtwork(images[images.length - 1]?.label),
    feedUrl: null,
  };
}

async function loadChart(country: string, genreId: number | null, limit: number, signal?: AbortSignal) {
  const genre = genreId == null ? "" : `/genre=${genreId}`;
  const json = (await getChartJson(
    `https://itunes.apple.com/${country}/rss/toppodcasts/limit=${limit}${genre}/json`,
    signal,
  )) as { feed?: { entry?: ChartEntry | ChartEntry[] } };
  const raw = json.feed?.entry;
  const entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return entries.map(fromChartEntry).filter((s): s is DiscoveredShow => s !== null);
}

/**
 * One chart. Falls back to the US chart where Apple has none for the
 * listener's country, as AntennaPod does. Cached by the query layer (see
 * `query-manager/discovery`), not here.
 */
export async function topShows(genreId: number | null, limit = 25, signal?: AbortSignal): Promise<DiscoveredShow[]> {
  const country = countryCode();
  try {
    const shows = await loadChart(country, genreId, limit, signal);
    if (shows.length > 0 || country === "us") return shows;
  } catch (err) {
    if (country === "us") throw err;
  }
  return loadChart("us", genreId, limit, signal);
}

type SearchResult = {
  collectionId?: number;
  collectionName?: string;
  artistName?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  feedUrl?: string;
};

export async function searchShows(term: string, signal?: AbortSignal): Promise<DiscoveredShow[]> {
  const query = term.trim();
  if (!query) return [];
  const json = (await getJson(
    `https://itunes.apple.com/search?media=podcast&entity=podcast&limit=40&country=${countryCode()}&term=${encodeURIComponent(query)}`,
    signal,
  )) as { results?: SearchResult[] };
  return (json.results ?? [])
    .filter((r) => r.feedUrl && r.collectionName)
    .map((r) => ({
      appleId: r.collectionId != null ? String(r.collectionId) : null,
      title: r.collectionName!,
      author: r.artistName ?? null,
      artworkUrl: r.artworkUrl600 ?? largeArtwork(r.artworkUrl100),
      feedUrl: r.feedUrl!,
    }));
}

/**
 * Feed addresses already looked up, by Apple id: a show's address is looked up
 * at the tap that opens it (`prefetchDiscoveredShow`) and again as its page
 * lands, and the second is answered here. A failed lookup is not kept.
 */
const lookedUp = new Map<string, Promise<string>>();

/** The feed behind an Apple id, or behind a pasted Apple Podcasts link. */
export function resolveFeedUrl(show: Pick<DiscoveredShow, "appleId" | "feedUrl">): Promise<string> {
  if (show.feedUrl) return Promise.resolve(show.feedUrl);
  const appleId = show.appleId;
  if (!appleId) return Promise.reject(new Error("This show has no feed address."));
  let found = lookedUp.get(appleId);
  if (!found) {
    found = lookUpFeedUrl(appleId);
    found.catch(() => lookedUp.delete(appleId));
    lookedUp.set(appleId, found);
  }
  return found;
}

async function lookUpFeedUrl(appleId: string): Promise<string> {
  const json = (await getJson(`https://itunes.apple.com/lookup?id=${appleId}`)) as {
    results?: SearchResult[];
  };
  const feedUrl = json.results?.[0]?.feedUrl;
  if (!feedUrl) throw new Error("Apple does not share this show's feed, so it cannot be followed here.");
  return feedUrl;
}

/** An Apple Podcasts web link's show id, if that is what was pasted. */
export function appleIdFromLink(input: string): string | null {
  return input.match(/podcasts\.apple\.com\/.*\/id(\d+)/i)?.[1] ?? input.match(/itunes\.apple\.com\/.*id(\d+)/i)?.[1] ?? null;
}
