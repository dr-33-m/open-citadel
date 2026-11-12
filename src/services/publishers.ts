/**
 * What publishers have asked of the app, on this phone.
 *
 * The rules themselves, and what each one takes away, are in
 * `samwell-shared/publishers.ts`. Here they are kept: the list the app
 * shipped with, joined by the server's latest (`GET /publishers/rules`),
 * which is remembered so a phone offline still keeps to a rule it has
 * already heard. Asked for at most once a day, alongside a blog refresh.
 */
import Storage from 'expo-sqlite/kv-store';
import {
  mergePublisherRules,
  PUBLISHER_RULES,
  publisherPermissions,
  PublisherRulesSchema,
  type PublisherPermissions,
  type PublisherRule,
} from 'samwell-shared';

import { SAMWELL_CLOUD_BASE_URL } from '@/constants/samwell-cloud';

const KEY = 'publisher-rules';
const DAY_MS = 24 * 3600 * 1000;
/** A blog refresh waits on this, so it gives up quickly. Hermes has no `AbortSignal.timeout`. */
const TIMEOUT_MS = 8000;

type Saved = { at: number; rules: PublisherRule[] };

let saved: Saved | null | undefined;

function read(): Saved | null {
  if (saved !== undefined) return saved;
  try {
    const raw = JSON.parse(Storage.getItemSync(KEY) ?? 'null') as Saved | null;
    const parsed = raw ? PublisherRulesSchema.safeParse(raw) : null;
    saved = parsed?.success && typeof raw?.at === 'number' ? { at: raw.at, rules: parsed.data.rules } : null;
  } catch {
    saved = null;
  }
  return saved;
}

/** Every rule this phone knows of. */
export function publisherRules(): PublisherRule[] {
  return mergePublisherRules(PUBLISHER_RULES, read()?.rules ?? []);
}

/** What the publisher of this address (a post, a feed, a site) allows. */
export function permissionsFor(address: string | null): PublisherPermissions {
  return publisherPermissions(address, publisherRules());
}

/**
 * Asks the server for its list when the last answer is a day old. No answer
 * (offline, an older server) leaves the last one standing.
 */
export async function refreshPublisherRules(): Promise<void> {
  if (!SAMWELL_CLOUD_BASE_URL) return;
  const last = read();
  if (last && Date.now() - last.at < DAY_MS) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${SAMWELL_CLOUD_BASE_URL}/publishers/rules`, { signal: controller.signal });
    if (!response.ok) return;
    const parsed = PublisherRulesSchema.safeParse(await response.json());
    if (!parsed.success) return;
    saved = { at: Date.now(), rules: parsed.data.rules };
    await Storage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Not reached: the last list stands.
  } finally {
    clearTimeout(timer);
  }
}
