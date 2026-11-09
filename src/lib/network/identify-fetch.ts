import { SAMWELL_CLOUD_BASE_URL } from '@/constants/samwell-cloud';

type Fetch = typeof globalThis.fetch;
type Options = {
  /** Sent with every request to Samwell Cloud. */
  headers: Readonly<Record<string, string>>;
  /** A request to Samwell Cloud was answered 426 Upgrade Required. */
  onUpgradeRequired: (response: Response) => void;
};

const WRAPPED = Symbol.for('open-citadel.identifiesCloudFetches');

function urlOf(input: Parameters<Fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * The request's own headers with the identity added. A `Request` passed in
 * with no `init` keeps its headers: `init.headers` replaces them outright,
 * and would have dropped its `Authorization`.
 */
function withHeaders(input: Parameters<Fetch>[0], init: RequestInit | undefined, headers: Readonly<Record<string, string>>): RequestInit {
  const own = init?.headers ?? (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined);
  const merged = new Headers(own);
  for (const [name, value] of Object.entries(headers)) if (!merged.has(name)) merged.set(name, value);
  return { ...init, headers: merged };
}

/**
 * Every plain `fetch` to Samwell Cloud says which copy of the app sent it, and
 * a 426 from any of them is heard in one place, as `reportCloudFetches` hears
 * whether the server answered. The chat's stream (XHR) and the cloud voices
 * (`expo/fetch`) do not go through `fetch`; they carry the same headers
 * through `cloudHeaders` and report a 426 for themselves.
 */
export function identifyCloudFetches({ headers, onUpgradeRequired }: Options): void {
  const original = globalThis.fetch as Fetch & { [WRAPPED]?: true };
  if (original[WRAPPED] || SAMWELL_CLOUD_BASE_URL.length === 0) return;

  const identifying: Fetch & { [WRAPPED]?: true } = (input, init) => {
    if (!urlOf(input).startsWith(SAMWELL_CLOUD_BASE_URL)) return original(input, init);
    return original(input, withHeaders(input, init, headers)).then((response) => {
      if (response.status === 426) onUpgradeRequired(response.clone());
      return response;
    });
  };
  identifying[WRAPPED] = true;
  globalThis.fetch = identifying;
}
