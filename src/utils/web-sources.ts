/**
 * How a web source a reply drew on is named and pictured.
 *
 * Pure, so the naming can be tested without a phone.
 */
import type { WebSource } from 'samwell-shared';

import { hostOf } from '@/utils/urls';

/** How many favicons the stack under a reply shows before the rest wait in the sheet. */
export const STACKED_SOURCES = 4;

/** Second-level labels that are part of a country's suffix, not the site's name: `co` in `co.uk`. */
const SUFFIX_LABELS = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu', 'ne', 'or']);

/** Host labels that say nothing about whose site it is. */
const SUBDOMAIN_NOISE = new Set(['www', 'm', 'mobile', 'amp']);

/**
 * The site's own name from its address: "bmw-syndikat" for
 * `www.bmw-syndikat.de`, "workshop-manuals" for `workshop-manuals.co.uk`,
 * "wikipedia" for `en.wikipedia.org`. What the eye scans a list of sources
 * for; the full title says the rest.
 */
export function siteName(url: string): string {
  const host = hostOf(url) ?? '';
  const labels = host.split('.').filter((label) => label && !SUBDOMAIN_NOISE.has(label));
  if (labels.length <= 1) return labels[0] ?? host;
  labels.pop();
  const last = labels.at(-1);
  if (labels.length > 1 && last && SUFFIX_LABELS.has(last)) labels.pop();
  return labels.at(-1) ?? host;
}

/** A source's title on one line: some pages carry line breaks in theirs. Falls back to the site's name. */
export function sourceTitle(source: WebSource): string {
  return source.title.replace(/\s+/g, ' ').trim() || siteName(source.url);
}

/** A source's passage as prose: the search hands back page markdown, heading marks ("## ") and all. */
export function sourceSnippet(source: WebSource): string {
  return source.snippet.replace(/(^|\s)#{1,6}\s+/g, '$1').replace(/\s+/g, ' ').trim();
}

/**
 * The site's small icon, from DuckDuckGo's icon service: only the host is
 * sent, never the page. Null for an address with no host.
 */
export function faviconUrl(url: string): string | null {
  const host = hostOf(url);
  return host ? `https://icons.duckduckgo.com/ip3/${host}.ico` : null;
}

/** The sources whose icons are stacked under a reply: one a site, the first few. */
export function stackedSources(sources: readonly WebSource[], max = STACKED_SOURCES): WebSource[] {
  const seen = new Set<string>();
  const stacked: WebSource[] = [];
  for (const source of sources) {
    const host = hostOf(source.url);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    stacked.push(source);
    if (stacked.length >= max) break;
  }
  return stacked;
}
