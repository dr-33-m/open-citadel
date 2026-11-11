/**
 * What a publisher has asked of Open Citadel, by host.
 *
 * A publisher who writes in (a removal request, "please don't fetch our
 * pages", "keep our posts out of AI") is answered by adding a line here and
 * deploying the server: `GET /publishers/rules` hands the list to every phone,
 * which keeps the last answer and applies it at once, with no app release.
 * The app also ships with this list, so a rule reaches a phone that has never
 * reached the server.
 *
 * Each rule only takes something away, and every field left out means "as
 * usual":
 *
 * - `wholePosts: false`: a post whose feed carries only its opening is never
 *   fetched from its page; it opens on the publisher's site.
 * - `cloud: false`: its posts are not sent to a cloud brain or a cloud voice.
 *   Samwell on the phone, and the phone's own voices, still read them.
 * - `explore: false`: left out of Explore's directory. Anyone can still
 *   follow it by its address, as any feed.
 *
 * Pure and dependency-free apart from zod.
 */
import { z } from 'zod';

export const PublisherRuleSchema = z.object({
  /** `aeon.co`. Covers its subdomains (`www.`, `blog.`) too. */
  host: z.string().min(1),
  wholePosts: z.literal(false).optional(),
  cloud: z.literal(false).optional(),
  explore: z.literal(false).optional(),
  /** Why, and when it was asked, for whoever reads this file next. Not shown. */
  note: z.string().optional(),
});
export type PublisherRule = z.infer<typeof PublisherRuleSchema>;

export const PublisherRulesSchema = z.object({ rules: z.array(PublisherRuleSchema) });

/** What a host's posts may have done to them, every rule for it applied. */
export interface PublisherPermissions {
  wholePosts: boolean;
  cloud: boolean;
  explore: boolean;
}

export const PUBLISHER_RULES: readonly PublisherRule[] = [];

function bareHost(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .split(/[/?#:]/)[0]
    .replace(/^www\./, '');
}

/** Whether `host` is `ruled` or one of its subdomains. */
function covers(ruled: string, host: string): boolean {
  return host === ruled || host.endsWith(`.${ruled}`);
}

/** What the rules allow for an address (a post's link, a feed, a site). An address with no host is allowed everything. */
export function publisherPermissions(address: string | null, rules: readonly PublisherRule[]): PublisherPermissions {
  const allowed: PublisherPermissions = { wholePosts: true, cloud: true, explore: true };
  const host = address ? bareHost(address) : '';
  if (!host) return allowed;
  for (const rule of rules) {
    if (!covers(bareHost(rule.host), host)) continue;
    if (rule.wholePosts === false) allowed.wholePosts = false;
    if (rule.cloud === false) allowed.cloud = false;
    if (rule.explore === false) allowed.explore = false;
  }
  return allowed;
}

/** The shipped list and the server's, as one: a rule in either applies. */
export function mergePublisherRules(shipped: readonly PublisherRule[], served: readonly PublisherRule[]): PublisherRule[] {
  return [...shipped, ...served];
}
