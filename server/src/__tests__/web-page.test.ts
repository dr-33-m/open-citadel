import { describe, expect, it, vi } from 'vitest';

import { readWebPage } from '../web-page';
import { isPublicAddress, pageKey, pageText, readablePageUrl } from '../web-page-text';

const PAGE = 'https://example.com/about';
const allowed = new Set([pageKey(new URL(PAGE))]);
const publicHost = async () => ['93.184.216.34'];
const html = (body: string, init: ResponseInit = {}) =>
  new Response(body, { headers: { 'content-type': 'text/html' }, ...init });

describe('isPublicAddress', () => {
  it.each(['127.0.0.1', '10.0.0.8', '172.16.4.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '2002:7f00:1::', 'not-an-address'])(
    'refuses %s',
    (address) => expect(isPublicAddress(address)).toBe(false),
  );
  it.each(['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111', '::ffff:93.184.216.34'])(
    'allows %s',
    (address) => expect(isPublicAddress(address)).toBe(true),
  );
});

describe('readablePageUrl', () => {
  it.each(['file:///etc/passwd', 'ftp://example.com', 'https://a:b@example.com', 'http://example.com:8080', 'nonsense'])(
    'refuses %s',
    (raw) => expect(readablePageUrl(raw)).toBeNull(),
  );
  it('takes an ordinary page', () => expect(readablePageUrl(PAGE)?.href).toBe(PAGE));
});

describe('pageText', () => {
  it('keeps the words and drops what is not read', () => {
    const { title, text, cut } = pageText(
      '<html><head><title>A &amp; B</title><script>evil()</script></head><body><nav>Menu</nav><p>Hello&nbsp;there</p><p>Next</p></body></html>',
      100,
    );
    expect(title).toBe('A & B');
    expect(text).toBe('Hello there\nNext');
    expect(cut).toBe(false);
  });
  it('says when it stopped early', () => {
    const { text, cut } = pageText(`<p>${'word '.repeat(50)}</p>`, 20);
    expect(text).toHaveLength(20);
    expect(cut).toBe(true);
  });
});

describe('readWebPage', () => {
  it('reads a page a search returned', async () => {
    const request = vi.fn(async () => html('<title>About</title><p>She ran a clinic.</p>')) as unknown as typeof fetch;
    const out = await readWebPage(PAGE, { allowed, resolve: publicHost, request });
    expect(out).toMatchObject({ title: 'About', text: 'She ran a clinic.', cut: false });
    expect(out.error).toBeUndefined();
  });

  it('never fetches an address the search did not return', async () => {
    const request = vi.fn() as unknown as typeof fetch;
    const out = await readWebPage('https://example.com/other', { allowed, resolve: publicHost, request });
    expect(out.error).toBe('only_pages_from_your_search_can_be_read');
    expect(request).not.toHaveBeenCalled();
  });

  it('never fetches a host that resolves to a private address', async () => {
    const request = vi.fn() as unknown as typeof fetch;
    const out = await readWebPage(PAGE, { allowed, resolve: async () => ['93.184.216.34', '10.0.0.1'], request });
    expect(out.error).toBe('page_not_reachable');
    expect(request).not.toHaveBeenCalled();
  });

  it('checks where a redirect goes before following it', async () => {
    const request = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: 'http://metadata.internal/latest' } }),
    ) as unknown as typeof fetch;
    const resolve = async (host: string) => (host === 'metadata.internal' ? ['169.254.169.254'] : ['93.184.216.34']);
    const out = await readWebPage(PAGE, { allowed, resolve, request });
    expect(out.error).toBe('page_not_reachable');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('gives up on a chain of redirects', async () => {
    const request = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: PAGE } }),
    ) as unknown as typeof fetch;
    expect((await readWebPage(PAGE, { allowed, resolve: publicHost, request })).error).toBe('page_not_reachable');
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('refuses what is not a page', async () => {
    const request = vi.fn(
      async () => new Response('%PDF', { headers: { 'content-type': 'application/pdf' } }),
    ) as unknown as typeof fetch;
    expect((await readWebPage(PAGE, { allowed, resolve: publicHost, request })).error).toBe('not_a_web_page');
  });

  it('turns a failed fetch into something he can say', async () => {
    const request = vi.fn(async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;
    expect((await readWebPage(PAGE, { allowed, resolve: publicHost, request })).error).toBe('page_not_reachable');
  });
});
