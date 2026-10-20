import { describe, expect, it } from "vitest";

import {
  FeedParseError,
  parseDuration,
  parseFeed,
} from "@/services/podcasts/feed-parser";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:psc="http://podlove.org/simple-chapters"
  xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <atom:link href="https://example.com/feed.xml" rel="self" type="application/rss+xml"/>
    <title>The Long Read &amp; More</title>
    <link>https://example.com</link>
    <language>en-gb</language>
    <description><![CDATA[<p>Stories worth your <b>time</b>.</p>]]></description>
    <itunes:author>Example Media</itunes:author>
    <itunes:image href="https://example.com/art.jpg"/>
    <podcast:guid>c0ffee</podcast:guid>
    <podcast:funding url="https://example.com/support">Support us</podcast:funding>
    <item>
      <title>1984</title>
      <guid isPermaLink="false">ep-2</guid>
      <pubDate>Tue, 03 Jun 2025 04:30:00 +0100</pubDate>
      <content:encoded><![CDATA[<p>Notes at 12:34.</p>]]></content:encoded>
      <description>Short</description>
      <enclosure url="https://cdn.example.com/2.mp3" length="1234" type="audio/mpeg"/>
      <itunes:duration>1:02:03</itunes:duration>
      <podcast:chapters url="https://example.com/2.json" type="application/json+chapters"/>
      <podcast:transcript url="https://example.com/2.html" type="text/html"/>
      <podcast:transcript url="https://example.com/2.srt" type="application/x-subrip"/>
      <podcast:transcript url="https://example.com/2.vtt" type="text/vtt"/>
      <psc:chapters version="1.2">
        <psc:chapter start="00:10:00" title="Middle"/>
        <psc:chapter start="0" title="Intro" href="https://example.com"/>
      </psc:chapters>
    </item>
    <item>
      <title>Only one chapter</title>
      <guid>ep-1</guid>
      <pubDate>Mon, 2 Jun 25 10:00 PDT</pubDate>
      <enclosure url="https://cdn.example.com/1.mp3" type="audio/mpeg"/>
      <itunes:duration>754</itunes:duration>
      <psc:chapters><psc:chapter start="0" title="Solo"/></psc:chapters>
    </item>
    <item>
      <title>A blog post, no audio</title>
      <guid>post</guid>
    </item>
  </channel>
</rss>`;

describe("parseFeed (RSS)", () => {
  const feed = parseFeed(RSS);

  it("reads the channel", () => {
    expect(feed.type).toBe("rss");
    expect(feed.title).toBe("The Long Read & More");
    expect(feed.author).toBe("Example Media");
    expect(feed.link).toBe("https://example.com");
    expect(feed.imageUrl).toBe("https://example.com/art.jpg");
    expect(feed.language).toBe("en-gb");
    expect(feed.fundingUrl).toBe("https://example.com/support");
    expect(feed.feedIdentifier).toBe("c0ffee");
    expect(feed.description).toContain("<b>time</b>");
  });

  it("skips items with nothing to play", () => {
    expect(feed.episodes.map((e) => e.guid)).toEqual(["ep-2", "ep-1"]);
  });

  it("keeps a numeric title as text and prefers content:encoded", () => {
    const [first] = feed.episodes;
    expect(first.title).toBe("1984");
    expect(first.description).toBe("<p>Notes at 12:34.</p>");
    expect(first.durationSec).toBe(3723);
    expect(first.fileSize).toBe(1234);
    expect(first.chaptersUrl).toBe("https://example.com/2.json");
    expect(first.pubDate).toBe("2025-06-03T03:30:00.000Z");
  });

  it("sorts inline chapters and reads a single one", () => {
    expect(feed.episodes[0].chapters.map((c) => c.title)).toEqual(["Intro", "Middle"]);
    expect(feed.episodes[0].chapters[1].startSec).toBe(600);
    expect(feed.episodes[1].chapters).toHaveLength(1);
  });

  it("reads loose dates with zone names and two-digit years", () => {
    expect(feed.episodes[1].pubDate).toBe("2025-06-02T17:00:00.000Z");
  });
});

describe("parseFeed (Atom)", () => {
  it("reads enclosures from links", () => {
    const feed = parseFeed(`<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">
        <title>Atom Cast</title>
        <id>urn:atom</id>
        <link rel="alternate" href="https://atom.example"/>
        <entry>
          <id>urn:1</id>
          <title>First</title>
          <published>2024-01-02T03:04:05Z</published>
          <link rel="enclosure" href="https://atom.example/1.m4a" type="audio/mp4" length="99"/>
          <summary>Hello</summary>
        </entry>
      </feed>`);
    expect(feed.type).toBe("atom");
    expect(feed.link).toBe("https://atom.example");
    expect(feed.episodes[0]).toMatchObject({
      guid: "urn:1",
      audioUrl: "https://atom.example/1.m4a",
      fileSize: 99,
      pubDate: "2024-01-02T03:04:05.000Z",
    });
  });
});

describe("parseFeed (not a feed)", () => {
  it("throws a readable error", () => {
    expect(() => parseFeed("<html><body>hi</body></html>")).toThrow(FeedParseError);
  });
});

describe("parseDuration", () => {
  it.each([
    ["45:10", 2710],
    ["01:00:00", 3600],
    ["3600", 3600],
    ["3600.6", 3601],
    ["", 0],
    ["abc", 0],
  ])("%s → %d", (raw, expected) => {
    expect(parseDuration(raw)).toBe(expected);
  });
});

describe("podcast:transcript", () => {
  it("keeps the richest transcript the show lists, not the first", () => {
    const feed = parseFeed(RSS);
    const episode = feed.episodes.find((e) => e.guid === "ep-2");
    expect(episode?.transcriptUrl).toBe("https://example.com/2.vtt");
    expect(episode?.transcriptType).toBe("text/vtt");
    expect(feed.episodes.find((e) => e.guid === "ep-1")?.transcriptUrl).toBeNull();
  });
});
