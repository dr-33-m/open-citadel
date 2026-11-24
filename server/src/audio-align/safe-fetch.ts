/**
 * Opening an episode's address from the server, safely.
 *
 * The address comes from a phone, so it may point (or redirect, or resolve)
 * at this server's own network: its metadata service, its database, a
 * neighbour on the private network. A check of the hostname as written stops
 * none of those once a redirect or a DNS answer is involved. So every hop is
 * fetched here, never by ffmpeg, and the address actually connected to is
 * checked at the moment of connecting (`lookup`), which covers redirects and
 * a name that answers differently the second time it is asked.
 */
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import net from 'node:net';

import { isPublicAudioUrl } from '../transcribe-upstream.js';
import { isPublicAddress } from '../web-page-text.js';

const MAX_REDIRECTS = 8;
const CONNECT_TIMEOUT_MS = 20_000;

/** A DNS lookup that refuses to hand back a private address. */
function publicLookup(
  hostname: string,
  options: object,
  callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '');
    const list = addresses as LookupAddress[];
    if (list.length === 0 || !list.every((a) => isPublicAddress(a.address))) {
      return callback(Object.assign(new Error(`${hostname} is not a public address`), { code: 'EPRIVATE' }), '');
    }
    const wantsAll = (options as { all?: boolean }).all === true;
    if (wantsAll) return callback(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
}

export interface OpenedAudio {
  /** Where the redirects ended. */
  url: string;
  status: number;
  headers: IncomingMessage['headers'];
  body: IncomingMessage;
}

/**
 * Opens an episode's address, following its redirects one checked hop at a
 * time. The body is the caller's to read or destroy.
 */
export async function openAudio(
  url: string,
  options: { headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<OpenedAudio> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // A literal address is never looked up, so it is checked here as well.
    const host = new URL(current).hostname.replace(/^\[|\]$/g, '');
    if (!isPublicAudioUrl(current) || (net.isIP(host) !== 0 && !isPublicAddress(host))) {
      throw new Error('The episode is not at a public address.');
    }
    const response = await request(current, options);
    const location = response.headers.location;
    if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && location) {
      response.resume();
      current = new URL(location, current).toString();
      continue;
    }
    return { url: current, status: response.statusCode ?? 0, headers: response.headers, body: response };
  }
  throw new Error('The episode redirected too many times.');
}

function request(url: string, options: { headers?: Record<string, string>; signal?: AbortSignal }): Promise<IncomingMessage> {
  const target = new URL(url);
  const client = target.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.get(
      target,
      {
        headers: { 'User-Agent': 'OpenCitadel/1.0', ...options.headers },
        lookup: publicLookup as never,
        signal: options.signal,
        timeout: CONNECT_TIMEOUT_MS,
      },
      resolve,
    );
    req.on('timeout', () => req.destroy(new Error('The episode took too long to answer.')));
    req.on('error', reject);
  });
}
