/** RSS 2.0 with the podcast namespaces AntennaPod reads. */
import type { ParsedChapter, ParsedEpisode, ParsedFeed } from "@/services/podcasts/feed/types";
import { parseFeedDate } from "@/services/feeds/dates";
import { parseChapterStart, parseDuration, positiveInt } from "@/services/podcasts/feed/values";
import { attr, firstLink, isNode, text, type Node } from "@/services/feeds/xml";
import { bestTranscript } from "@/services/podcasts/transcript/formats";

function parseChapters(item: Node): ParsedChapter[] {
  const container = item["psc:chapters"];
  const list = isNode(container) ? container["psc:chapter"] : null;
  if (!Array.isArray(list)) return [];
  const chapters: ParsedChapter[] = [];
  for (const chapter of list) {
    const startSec = parseChapterStart(attr(chapter, "start"));
    const title = attr(chapter, "title");
    if (startSec == null || !title) continue;
    chapters.push({
      startSec,
      title,
      link: attr(chapter, "href"),
      imageUrl: attr(chapter, "image"),
    });
  }
  return chapters.sort((a, b) => a.startSec - b.startSec);
}

function parseRssItem(item: Node): ParsedEpisode | null {
  let audioUrl = attr(item.enclosure, "url");
  let mimeType = attr(item.enclosure, "type");
  let fileSize = positiveInt(attr(item.enclosure, "length"));
  if (!audioUrl && Array.isArray(item["media:content"])) {
    const media = item["media:content"].find((m) => {
      const type = attr(m, "type") ?? "";
      return attr(m, "url") && (type.startsWith("audio") || type.startsWith("video") || !type);
    });
    audioUrl = attr(media, "url");
    mimeType = attr(media, "type");
    fileSize = positiveInt(attr(media, "fileSize"));
  }
  // An item with nothing to play is a blog post in a podcast's clothing.
  if (!audioUrl) return null;

  const listed = Array.isArray(item["podcast:transcript"]) ? item["podcast:transcript"] : [];
  // The richest of the transcripts the show publishes, not merely the first.
  const transcript = bestTranscript(listed.map((t) => ({ url: attr(t, "url"), type: attr(t, "type") })));
  const title = text(item.title) ?? text(item["itunes:title"]) ?? "Untitled episode";

  return {
    guid: text(item.guid),
    title,
    description:
      text(item["content:encoded"]) ?? text(item.description) ?? text(item["itunes:summary"]),
    link: firstLink(item.link),
    pubDate: parseFeedDate(text(item.pubDate) ?? text(item["dc:date"])),
    imageUrl: attr(item["itunes:image"], "href"),
    audioUrl,
    mimeType,
    durationSec: parseDuration(text(item["itunes:duration"])),
    fileSize,
    chaptersUrl: attr(item["podcast:chapters"], "url"),
    transcriptUrl: transcript?.url ?? null,
    transcriptType: transcript?.type ?? null,
    chapters: parseChapters(item),
  };
}

export function parseRss(channel: Node): ParsedFeed {
  const items = Array.isArray(channel.item) ? channel.item : [];
  return {
    type: "rss",
    title: text(channel.title) ?? text(channel["itunes:title"]) ?? "Untitled podcast",
    author: text(channel["itunes:author"]) ?? text(channel["dc:creator"]) ?? text(channel.managingEditor),
    description:
      text(channel.description) ?? text(channel["itunes:summary"]) ?? text(channel["content:encoded"]),
    link: firstLink(channel.link),
    imageUrl:
      attr(channel["itunes:image"], "href") ??
      (isNode(channel.image) ? text(channel.image.url) : null),
    language: text(channel.language),
    fundingUrl: attr(channel["podcast:funding"], "url"),
    feedIdentifier: text(channel["podcast:guid"]),
    episodes: items
      .filter(isNode)
      .map(parseRssItem)
      .filter((e): e is ParsedEpisode => e !== null),
  };
}
