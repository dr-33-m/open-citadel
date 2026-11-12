import { describe, expect, it } from 'vitest';

import { mergePublisherRules, publisherPermissions, PublisherRulesSchema, type PublisherRule } from '../publishers';

const RULES: PublisherRule[] = [
  { host: 'aeon.co', wholePosts: false },
  { host: 'www.example.org', cloud: false },
  { host: 'example.org', explore: false },
];

describe('publisherPermissions', () => {
  it('allows everything where no rule applies', () => {
    expect(publisherPermissions('https://fs.blog/post', RULES)).toEqual({ wholePosts: true, cloud: true, explore: true });
    expect(publisherPermissions(null, RULES)).toEqual({ wholePosts: true, cloud: true, explore: true });
  });

  it('matches the host and its subdomains, with or without www', () => {
    expect(publisherPermissions('https://aeon.co/essays/x', RULES).wholePosts).toBe(false);
    expect(publisherPermissions('https://www.aeon.co/essays/x', RULES).wholePosts).toBe(false);
    expect(publisherPermissions('https://psyche.aeon.co/feed', RULES).wholePosts).toBe(false);
  });

  it('does not match a host that only ends in the same letters', () => {
    expect(publisherPermissions('https://notaeon.co/x', RULES).wholePosts).toBe(true);
  });

  it('applies every rule for a host', () => {
    expect(publisherPermissions('https://blog.example.org/a', RULES)).toEqual({ wholePosts: true, cloud: false, explore: false });
  });
});

describe('the served list', () => {
  it('reads a list and refuses a rule that would grant rather than take away', () => {
    expect(PublisherRulesSchema.safeParse({ rules: [{ host: 'aeon.co', cloud: false }] }).success).toBe(true);
    expect(PublisherRulesSchema.safeParse({ rules: [{ host: 'aeon.co', cloud: true }] }).success).toBe(false);
  });

  it('keeps the shipped rules beside the served ones', () => {
    const merged = mergePublisherRules([{ host: 'a.com', cloud: false }], [{ host: 'b.com', explore: false }]);
    expect(publisherPermissions('https://a.com', merged).cloud).toBe(false);
    expect(publisherPermissions('https://b.com', merged).explore).toBe(false);
  });
});
